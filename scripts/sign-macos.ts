// @effect-diagnostics nodeBuiltinImport:off - electron-builder calls this plain async hook outside Effect.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { sign as signApplication, type SignOptions } from "@electron/osx-sign";

/**
 * Local builds can sign with a self-signed certificate kept in its own keychain, named by
 * T3CODE_MAC_LOCAL_SIGN_KEYCHAIN with its password in a `password` file beside it. Ad hoc
 * signatures change with every build, so macOS forgets privacy grants (Documents access) on
 * each update; a stable certificate keeps them.
 */
function localSigning() {
  const keychain = process.env.T3CODE_MAC_LOCAL_SIGN_KEYCHAIN?.trim();
  if (!keychain) return null;
  const password = NodeFS.readFileSync(
    NodePath.join(NodePath.dirname(keychain), "password"),
    "utf8",
  ).trim();
  NodeChildProcess.execFileSync("/usr/bin/security", ["unlock-keychain", "-p", password, keychain]);
  const identities = NodeChildProcess.execFileSync("/usr/bin/security", [
    "find-identity",
    "-p",
    "codesigning",
    keychain,
  ]).toString();
  const identity = /\)\s+([0-9A-F]{40})\s/.exec(identities)?.[1];
  if (!identity) throw new Error(`No code signing identity in ${keychain}`);
  return { keychain, identity };
}

/** Sign files with matching options together instead of spawning codesign for each file. */
export default async function sign(options: SignOptions): Promise<void> {
  const local = localSigning();
  await signApplication({
    ...options,
    ...(local ? { ...local, identityValidation: false, preAutoEntitlements: false } : {}),
    batchCodesignCalls: true,
  });
}
