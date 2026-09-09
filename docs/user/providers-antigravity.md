# Antigravity

T3 Code runs Google's official Antigravity ACP agent on your selected environment.
It has its own sign-in, separate from the Antigravity IDE or CLI. Google controls
which models and account access are available through this agent.

## Set up Antigravity

On web or desktop, open **Settings** > **Providers**, select the device that runs your project,
then select **Antigravity**. On mobile, open **Settings** > **Environments**, expand the
environment, then choose **Set up Antigravity**. An existing setup shows **Manage Antigravity**.
The model picker can open setup for the selected environment too.

1. Choose **Enable Antigravity**. Antigravity is off by default.
2. Choose **Install Antigravity**. T3 Code downloads the official runtime from Google to that
   environment. Installation continues if you leave the page or reconnect.
3. Choose **Sign in with Google**.
4. Choose **Open sign-in page** on web or desktop, or **Open Google sign-in** on mobile. You can
   use **Copy sign-in link** to open it in another browser.
5. Complete Google sign-in. Use the account you use for Antigravity.
6. Wait for T3 Code to confirm sign-in and load the model choices. Select an Antigravity model
   in the thread's model picker.

Installation continues if you leave settings or reconnect. Setup requires
permission to operate the environment; update an older server if it does not offer
Antigravity setup.

### Sign in from a remote device

Google returns to a `127.0.0.1` address. It can finish directly when your browser is
on the environment's machine. From another device, the final page will usually
fail to load because the sign-in listener is on the environment.

On a phone or another computer, the final page will usually fail to load. This is expected.
Copy the full address from the browser, including everything after `?`, and paste it into the
return URL field in T3 Code. Choose **Continue** on web or desktop, or **Complete sign-in** on
mobile. Do not change the address to your server's hostname.

The return URL contains a temporary sign-in code. Paste it only into the setup
field. A successful callback page alone does not confirm account access; wait for
T3 Code's confirmation.

### Other sign-in methods

Choose **Sign-in method** in Antigravity settings on web or desktop. Mobile shows the selected method and its connection controls.

| Method                     | Credentials                                                                                  |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| Google account             | Personal Google sign-in in the browser                                                       |
| Gemini Enterprise          | Browser sign-in, GCP project, and GCP location                                               |
| Gemini API key             | API key; choose Connect without a browser                                                    |
| Agent Platform / Vertex AI | API key, or GCP project and location with Application Default Credentials on the environment |

The Antigravity API key field is stored in plain text in settings on the
environment. The agent uses the method and credentials selected for this instance;
ambient `GEMINI_API_KEY` and Google credential variables do not override them.
Changing the method stops the instance's sessions. Sign out before replacing an
account.

## Runtime installation

Managed installation supports Apple Silicon macOS, Linux x64 or ARM64, and Windows
x64 or ARM64. Intel Macs can connect to a supported remote environment. Allow
several GB of free disk space, especially on Linux.

### Use a manual installation

Download the archive for your environment from the [official ACP Registry][registry].
Extract the ACP executable and its `localharness_external` helper into the same
directory, at the same version. Make both executable on macOS or Linux; Windows
uses `.exe` files.

Set **Binary path** to the ACP executable on the environment and update it yourself.
Leave the field blank to use the managed runtime, or a compatible executable on
`PATH` if no managed runtime is installed.

## Models and threads

The model list comes from your Antigravity account and can differ from other
Antigravity apps. A resumed thread keeps its selected model. If access to that
model ends, select another available model before continuing.

Use Antigravity's native `/plan` command for planning. T3 Code's separate Plan mode
is unavailable. Tool approvals follow [Permission modes](./permission-modes.md).
Questions with fixed choices still need one of the offered answers, even in
**Full access**.

T3 Code keeps conversation history and file diffs, but Antigravity cannot rewind
its conversation. Reverting a thread or editing and resubmitting an earlier turn
is unavailable. Continue with a follow-up message or start a new thread.

### Skills and attachments

Put project skills in `.agents/skills`. T3 Code also reads `.gemini/skills` and the
legacy `.agent/skills` directory. Among these project locations, the first copy
wins in this order: `.gemini/skills`, `.agents/skills`, `.agent/skills`. See
[commands and skills](./composer.md#commands-and-skills) for invoking them.

Skills for every project go in `~/.gemini/config/skills` or
`~/.gemini/antigravity-cli/skills`. Antigravity does not read `~/.agents/skills`,
so a skill there only appears when the project itself is your home directory.

Antigravity accepts images, PDFs, text files, and supported audio formats directly.
Its limits are 1 MiB per text file, 10 MiB per image, 20 MiB per audio clip, and
50 MiB total attachments per message. Unsupported formats are rejected. These
limits can be lower than the general upload limit; uploading a file does not
mean this provider can use it.

### Subagents

Antigravity groups subagent activity into batches. You cannot open or control
individual subagents, and an idle batch does not confirm that every child
succeeded. See [agent work](./thread-sidebar.md#inspect-agent-work) for where to
inspect activity.

## Accounts and removal

Add an Antigravity provider instance for each Google account in
**Settings > Providers** on web or desktop. Each has its own sign-in; downloaded
runtimes are shared on the environment.

| Action                                                                           | Result                                                                                                                        |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Disable Antigravity                                                              | Stops the instance's sessions. Keeps Google sign-in, thread history, and files.                                               |
| Sign out of Google                                                               | Stops the instance's sessions and removes its saved Google credentials. Keeps thread history and files.                       |
| Remove downloaded runtime on web or desktop, or Remove managed install on mobile | Removes the runtime shared by Antigravity instances on that environment. Keeps Google credentials, thread history, and files. |

Send `/logout` by itself in an Antigravity thread to sign out that provider instance. This has
the same effect as **Sign out of Google**, including stopping its other sessions.

| Action                    | Effect                                                            |
| ------------------------- | ----------------------------------------------------------------- |
| Disable                   | Stops the instance's sessions and keeps its Google sign-in.       |
| Sign out of Google        | Stops the instance's sessions and removes its saved Google login. |
| Remove downloaded runtime | Removes the shared installation and keeps Google credentials.     |

All three keep thread history and workspace files. Sending `/logout` by itself in
a thread signs out its instance, including stopping that instance's other sessions.
Sign out, then sign in again to replace an account.

Before removing a managed runtime, disable its instances and cancel any active
installation. Clear any explicit binary path pointing into that runtime. Removal
is refused while the runtime is in use.

## Check access and troubleshoot

A server restart keeps your Google sign-in. The provider shows the saved account
until a session, a refresh, or a sign-out reports something new.

To check account access and reload models on web or desktop, open **Settings** > **Providers**
and select the circular arrow beside **Checked** at the top of the page. Its tooltip says
**Refresh provider status**. On mobile, use **Refresh models** in the model picker.
Refresh uses saved Google sign-in and does not open a login page. If sign-in is required,
use the provider's setup controls. Automatic status checks verify the installation only.

To check access and reload models, use **Refresh provider status** in web or desktop
provider settings, or **Refresh models** in mobile thread settings. If asked to
sign in again, use setup on web or desktop.

If Google reports `SUBSCRIPTION_REQUIRED`, an account restriction, or a usage limit,
follow the provider's message and any retry time. See [Google's account plans][plans]
for eligibility.

[registry]: https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json
[plans]: https://antigravity.google/docs/plans
