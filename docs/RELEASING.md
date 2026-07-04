# Releasing

## How a release works

Pushing a tag matching `v*` (e.g. `v0.2.0`) triggers
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which:

1. Builds the extension for both targets and zips the *contents* of
   `extension/dist/chromium` and `extension/dist/firefox` into
   `screenshot-drop-chromium-<tag>.zip` and `screenshot-drop-firefox-<tag>.zip`.
2. Builds the service for Linux amd64 and arm64 (`make -C service release`).
3. Computes `SHA256SUMS.txt` over all four artifacts.
4. Creates a GitHub release for the tag (`--generate-notes`) and attaches all
   of the above.
5. If Firefox signing is enabled (see below), a second job signs the Firefox
   build with Mozilla's Add-on Signing API and uploads the resulting
   `.xpi` to the same release.

To cut a release:

```bash
git tag v0.2.0
git push origin v0.2.0
```

## Enabling Firefox (AMO) signing

Firefox requires extensions to be signed by Mozilla before they can be
installed permanently (not as a temporary add-on). The `sign-firefox` job is
skipped by default and only runs once you opt in:

1. Create an account at [addons.mozilla.org](https://addons.mozilla.org) if
   you don't have one.
2. Go to **Tools > Manage API Keys** and generate a JWT issuer/secret pair.
3. Add two repo secrets (Settings > Secrets and variables > Actions >
   Secrets): `AMO_JWT_ISSUER` and `AMO_JWT_SECRET`.
4. Add a repo variable (same page, **Variables** tab):
   `AMO_SIGNING_ENABLED` = `true`.

With that set, the next tag push signs and uploads the `.xpi` automatically.

The extension's Firefox add-on ID that AMO signs against
(`browser_specific_settings.gecko.id`) lives in
[`extension/manifest.firefox.json`](../extension/manifest.firefox.json) —
it must stay stable across releases, since AMO ties signing history to it.
