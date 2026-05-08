# Dependency Scanning

ClawShield can inspect common dependency manifests and lockfiles inside skill bundles and workspaces.

## What It Reads

- `package.json`
- `package-lock.json`
- `pnpm-lock.yaml`
- `yarn.lock`
- `requirements.txt`
- `pyproject.toml`

## What It Reports

Dependency scanning adds a `dependencies` block to JSON reports:

```json
{
  "dependencies": {
    "manifests": [
      {
        "ecosystem": "npm",
        "file": "package.json",
        "directory": ".",
        "name": "my-skill",
        "dependencyCount": 3,
        "scriptCount": 1
      }
    ],
    "lockfiles": [
      {
        "file": "package-lock.json",
        "ecosystem": "npm",
        "directory": "."
      }
    ]
  }
}
```

It emits findings for:

- Invalid dependency manifests.
- Install lifecycle scripts such as `preinstall`, `install`, `postinstall`, and `prepare`.
- Npm dependency manifests without a matching lockfile in the same directory.
- Unpinned dependency specs such as ranges, tags, or wildcards.
- Direct Git, URL, GitHub shorthand, or local file dependency sources.
- Dependency names containing security-sensitive terms such as `token`, `secret`, `credential`, `stealer`, `keylogger`, or `backdoor`.

## Examples

```bash
node src/cli.js scan examples/dependency-risky-skill --fail-on none
node src/cli.js scan examples/dependency-safe-skill --json --fail-on none
node src/cli.js scan examples/dependency-python-skill --fail-on none
```

## Trust Model

Dependency scanning is static and local. It does not install packages, execute lifecycle scripts, contact registries, or claim that a package is safe. It highlights supply-chain risk signals so reviewers can pin versions, commit lockfiles, avoid install-time code, and manually review direct sources before enabling a skill.
