import * as Schema from "effect/Schema";
import {
  AttachmentCreateUploadUrlInput,
  type ChatAttachment,
  type EnvironmentId,
} from "@t3tools/contracts";
import { runAttachmentUploadCycle } from "@t3tools/client-runtime/state/attachments";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import { executeAtomQuery, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { attachmentEnvironment } from "../../state/attachments";
import { assetEnvironment } from "../../state/assets";
import { readPreparedConnection } from "../../state/session";

const decodeUpload = Schema.decodeUnknownSync(AttachmentCreateUploadUrlInput);

export async function uploadTaskFile(
  environmentId: EnvironmentId,
  file: File,
): Promise<ChatAttachment> {
  const metadata = {
    type: file.type.startsWith("image/") ? ("image" as const) : ("file" as const),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
  };
  const result = await runAttachmentUploadCycle({
    registry: appAtomRegistry,
    createUploadUrl: attachmentEnvironment.createUploadUrl,
    remove: attachmentEnvironment.remove,
    environmentId,
    upload: decodeUpload(metadata),
    resolveUploadUrl: (relative) => {
      const connection = readPreparedConnection(environmentId);
      return connection ? resolveAssetUrl(connection.httpBaseUrl, relative) : null;
    },
    transport: (url) => {
      const controller = new AbortController();
      return {
        abort: () => controller.abort(),
        done: fetch(url, {
          method: "POST",
          body: file,
          headers: { "Content-Type": metadata.mimeType },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120_000)]),
        }).then((response) => {
          if (!response.ok) throw new Error(`Upload failed (${response.status}).`);
        }),
      };
    },
  });
  if (result.status !== "uploaded")
    throw result.status === "failed" ? result.error : new Error("Upload cancelled.");
  return { ...metadata, id: result.attachmentId };
}

export async function taskAttachmentUrl(environmentId: EnvironmentId, attachment: ChatAttachment) {
  const connection = readPreparedConnection(environmentId);
  if (!connection) throw new Error("Reconnect the task's device to open its attachment.");
  const result = await executeAtomQuery(
    appAtomRegistry,
    assetEnvironment.createUrl({
      environmentId,
      input: {
        resource: {
          _tag: "attachment",
          attachmentId: attachment.id,
          fileName: attachment.name,
          mimeType: attachment.mimeType,
        },
      },
    }),
    { reportFailure: false, refresh: true },
  );
  if (result._tag === "Failure") throw squashAtomCommandFailure(result);
  const url = resolveAssetUrl(connection.httpBaseUrl, result.value.relativeUrl);
  if (!url) throw new Error("The attachment is unavailable.");
  return url;
}
