# Mobile development lifecycle

The [connection runtime's HMR boundary](../../apps/mobile/src/lib/hot-swappable-atom-runtime.ts)
keeps a stable atom runtime and replaces its Effect layer through a writable atom.
It accepts the update only after installing the new layer. Otherwise importers
retain the old behavior even though Metro reports a successful refresh.

Do not reset the shared atom registry to refresh a connection-runtime edit. Reset
removes listeners from mounted consumers that Metro has no reason to rerender.
When the registry or managed-runtime module itself changes, normal Metro propagation
disposes its old resources. This boundary does not make arbitrary module-level atom
families safe to hot-swap. Production uses an ordinary atom runtime.

[Environment supervisor scopes](../../packages/client-runtime/src/connection/registry.ts)
are children of the registry scope. The per-environment map supports targeted
shutdown, but a supervisor created after its cleanup runs would escape it. A closed
parent scope also closes late arrivals, preventing interrupted startup or runtime
replacement from leaving a WebSocket alive outside the new registry.

The [Uniwind patch](../../patches/uniwind@1.11.0.patch) still compiles CSS on Metro
updates so newly used classes are discovered. It skips global style invalidation
only when the generated stylesheet and theme list are unchanged. Skipping compilation
would lose new classes; invalidating every consumer for unchanged output makes an
ordinary component edit refresh the whole app. The fingerprint is recorded only
after initialization succeeds.

## Fork device builds

`T3CODE_IOS_BUNDLE_ID` selects a separate iOS app identity. Fork builds disable
upstream Expo updates and the upstream native Apple/Google sign-in configuration.
`T3CODE_IOS_TEAM_ID` supplies the signing team. Generate the native project with
these settings, install its pods, and keep the same settings for the Sqim device
build. The custom app has separate on-device data; it must pair its environments.

Full device builds need a paid Apple Developer team with provisioning for push,
associated domains, and app groups. An available Apple Development certificate
alone does not establish that capability. The existing Personal Team build mode
omits unsupported capabilities and extensions, so it is a reduced test build.
A custom bundle also requires matching backend push credentials and OAuth/domain
registration for those managed features. Successful signing alone does not prove
that upstream T3 Connect push or native account integrations support the fork.
