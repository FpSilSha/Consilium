# Key persistence and security hardening spec

## Context

The app stores API keys in an in-memory `Map` inside `key-vault.ts`. Keys are never written to disk today. Display is masked via `maskKey()`, logs are scrubbed via `redactKeys()`, and the Zustand store only holds `maskedKey`. Raw keys never enter system prompts, messages, or the shared context bus. Transmission goes direct to provider APIs over HTTPS with no proxy.

This spec adds persistent encrypted storage and closes the remaining security gaps.

---

## 1. Persist keys with Electron safeStorage

### Goal

Keys survive app restart without the user re-entering them. Encryption at rest comes free from the OS keychain.

### Architecture

All crypto happens in the **main process**. The renderer never touches `safeStorage` directly.

#### Storage format

Use a single JSON file at `app.getPath('userData')/keys.json`. Each entry is keyed by provider ID and holds the encrypted buffer as a base64 string:

```json
{
  "openai": "<base64 encrypted blob>",
  "anthropic": "<base64 encrypted blob>"
}
```

You may use `electron-store` instead of raw `fs` if the project already depends on it, but the file must live in `userData`.

#### IPC channels (exposed via contextBridge)

Define three channels:

- `keys:load` — renderer requests all stored keys on startup. Main decrypts each entry with `safeStorage.decryptString()` and returns an array of `{ providerId, rawKey }`.
- `keys:save` — renderer sends `{ providerId, rawKey }` after the user adds a key. Main encrypts with `safeStorage.encryptString()` and writes to `keys.json`.
- `keys:delete` — renderer sends `{ providerId }`. Main removes the entry from `keys.json`.

#### App launch flow

1. App starts → main process reads `keys.json`.
2. For each entry, call `safeStorage.decryptString(Buffer.from(base64, 'base64'))`.
3. Send decrypted keys to renderer via `keys:load` response.
4. Renderer populates the in-memory `Map` in `key-vault.ts` as if the user had entered them manually.

#### User adds a key flow

1. User pastes key in UI.
2. Renderer validates the key (see section 2).
3. On success, renderer sends `keys:save` IPC with `{ providerId, rawKey }`.
4. Main process calls `safeStorage.encryptString(rawKey)`, converts the resulting `Buffer` to base64, and writes to `keys.json`.
5. Renderer adds the key to the in-memory `Map` as normal.

#### User deletes a key flow

1. Renderer sends `keys:delete` IPC with `{ providerId }`.
2. Main process removes the entry from `keys.json` and writes the file.
3. Renderer removes the key from the in-memory `Map`.

### OS keychain backends

- **macOS**: Keychain (via `safeStorage` which wraps the Chromium cookie encryption key stored in Keychain)
- **Windows**: DPAPI (Data Protection API), scoped to the current user
- **Linux**: libsecret (requires a running keyring like GNOME Keyring or KWallet)

### Edge case: safeStorage unavailable

On some Linux setups, no keyring is running and `safeStorage.isEncryptionAvailable()` returns `false`. In this case:

- Fall back to the current behavior (in-memory only, keys lost on restart).
- Show a one-time notice in the UI explaining that key persistence is unavailable and suggesting the user install a keyring.

---

## 2. Validate keys on add

### Goal

Catch typos, revoked keys, and invalid formats before persisting.

### Implementation

When the user submits a key, fire a lightweight test API call to the provider before saving:

- **OpenAI**: `GET /v1/models` (or `POST /v1/chat/completions` with `max_tokens: 1`)
- **Anthropic**: `POST /v1/messages` with `max_tokens: 1`
- Adapt per provider. The call should be the cheapest possible authenticated request.

#### Behavior

- On success (2xx): proceed with `keys:save`.
- On auth failure (401/403): show an error in the UI. Do not persist.
- On network error / timeout: show a warning but allow the user to save anyway (they may be offline). Mark the key as "unverified" in the store and re-validate on next app launch.

---

## 3. Wire redactKeys() into the error pipeline

### Goal

Prevent raw API keys from leaking through crash reports, error logging, or stack traces.

### Implementation

- Ensure every error reporting path (Sentry, custom crash reporter, console.error wrappers, IPC error forwarding) runs through `redactKeys()` before emitting.
- This includes stack traces where a raw key might appear as a function argument or in a URL string.
- Treat this as a defense-in-depth layer. The primary protection is that raw keys should rarely appear in call stacks, but if they do, this catches it.

---

## 4. Key format regex test suite

### Goal

Ensure `redactKeys()` reliably scrubs every provider's key format, now and as formats change.

### Implementation

- Create a test file with sample key patterns for every supported provider.
- Each test asserts that `redactKeys(inputContainingKey)` returns a string with the key fully replaced.
- Include edge cases: keys embedded mid-sentence, keys adjacent to punctuation, keys in JSON strings, keys in URL query parameters.
- When adding a new provider, adding its key format to this test suite is a mandatory step.
- Treat a regex miss (test failure) as a security bug with the same severity as a data leak.

---

## Summary of changes

| Item | What to build | Priority |
|------|--------------|----------|
| safeStorage persistence | IPC channels, encrypt/decrypt, keys.json | High — core UX and security improvement |
| Key validation on add | Test API call per provider before persisting | High — low effort, prevents user confusion |
| Error pipeline redaction | Wire redactKeys() into all error/crash paths | Medium — defense in depth |
| Key format test suite | Automated tests for redactKeys() coverage | Medium — prevents silent regression |
