# npm Publishing

ClawGuard is published as:

```text
@denial-web/clawguard
```

## Preferred Path: Trusted Publishing

Use npm trusted publishing so GitHub Actions can publish with short-lived OIDC credentials instead of local OTPs or long-lived npm tokens.

Workflow file:

```text
.github/workflows/publish.yml
```

Configure this on npmjs.com:

```text
Provider: GitHub Actions
Organization or user: denial-web
Repository: clawguard
Workflow filename: publish.yml
Environment name: blank
```

After the trusted publisher is connected, publish from GitHub Actions:

1. Go to the GitHub repository.
2. Open `Actions`.
3. Select `Publish to npm`.
4. Click `Run workflow`.

The workflow also runs automatically when a GitHub release is published.

## First Publish Notes

If npm does not allow trusted publishing before the first package publish, publish manually once from a local terminal after enabling npm 2FA:

```bash
npm publish --access public
```

After the first package exists on npm, connect trusted publishing and use GitHub Actions for later releases.

## Release Flow

For a patch release:

```bash
npm version patch
git push origin main --follow-tags
gh release create v0.1.1 --generate-notes
```

The release event will trigger `.github/workflows/publish.yml`.

## Verify

After publishing, test the package from npm:

```bash
cd /private/tmp
npx --package @denial-web/clawguard clawguard scan examples/risky-skill
```

When testing from outside the repository, point the scan command at a real skill path. For example:

```bash
cd /private/tmp
npx --package @denial-web/clawguard clawguard scan /Users/hy/CascadeProjects/ClawGuard/examples/risky-skill
```
