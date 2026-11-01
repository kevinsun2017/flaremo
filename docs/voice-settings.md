# Owner-managed voice recognition

The instance owner configures the shared voice service under **Account → Voice recognition settings**. Voice credentials are billing-level instance secrets, so management sits at the same owner-only tier as branding; team administrators and members cannot read or write them. No new tags, role tables or role-assignment UI are introduced. Ordinary members use Capture with the configured service; they cannot see its credentials.

The browser renders no settings panel until a fresh, user-scoped `/api/app/me` response confirms `can_manage_voice_service: true`. Pending, failed and non-owner responses keep the panel unmounted. The API independently verifies the active browser session and voice-service management permission for every request, and exact Origin for writes. It rejects API-token authentication.

## Configuration precedence

Environment variables win when a complete credential set resolves from `FLAREMO_ASR_*`; the database copy (saved from the settings UI) applies otherwise. An incomplete environment set does not take over; the saved configuration remains effective. This keeps existing deployments that already set provider variables working without any migration, and the panel states explicitly when the environment layer is in charge.

Deployment-level environment setup remains documented in [voice-capture.md](./voice-capture.md). The UI path needs no console access: choose Tencent Cloud, DashScope, or Volcano Engine (Doubao) and enter all required credentials on the first save or when changing provider. Blank credential fields preserve credentials previously saved through this UI for the same provider. Environment secrets are not automatically imported. Save does not contact the cloud provider. The optional connection test uses the effective settings and may incur provider charges; it does not send audio or verify transcription quality.

## Optional encryption at rest

Credentials are stored in the dedicated `voice_service_config` D1 table. When the deployment sets an independent encryption secret of at least 32 characters, credentials are sealed as AES-GCM ciphertext with a fresh nonce:

```sh
openssl rand -hex 32
pnpm exec wrangler secret put FLAREMO_VOICE_CONFIG_KEY --config ./wrangler.jsonc
```

Paste the generated value into the secret prompt and retain it in your password manager. Do not reuse the login secret or an ASR provider key. Never commit the value. For local development, set the same binding in an ignored `.dev.vars` file. Without the secret, credentials persist as plaintext JSON in the same table (D1 encrypts data at rest); the panel says so and recommends setting the key, then saving again to upgrade existing credentials to encrypted storage.

## Storage and lifecycle

Responses return only configuration metadata plus masked tails (`****` + last four characters) of secret fields; full values never leave the Worker and are held only in component state while editing — never in browser persistence or the query cache. Settings and status responses use `Cache-Control: no-store`.

Saving with Enable unchecked retains stored credentials while disabling Capture. Deleting credentials writes a disabled marker, so old credentials cannot silently reactivate the service. A v1 ciphertext without the matching encryption key fails closed. Configuration updates use revisions to reject stale writes from another open tab. Disabling is checked again at the existing session reauthentication interval (up to 60 seconds); new connections are rejected immediately. This is not instantaneous revocation of every active connection.

Normal memo exports do not include this configuration. Full D1 backups contain ciphertext; restore requires the corresponding independently retained encryption secret. Replacing the secret without re-encrypting makes existing credentials unreadable. Restore the original secret or delete the saved credentials and enter them again. There is no automatic key-rotation workflow in this version.

The panel is localized into all eight UI languages.
