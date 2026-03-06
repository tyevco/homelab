# Homelab – Claude Notes

## Releasing a New Version

Releases are managed by **release-please** (`release-please.yml`). On every push to `main`, it maintains a release PR that:
- Auto-bumps `package.json` version based on conventional commits
- Generates a CHANGELOG entry

When the release PR is merged, it creates a `vX.Y.Z` tag which triggers **both**:
- `docker-publish.yml` → Docker image pushed to `ghcr.io/tyevco/homelab`
- `lxc-agent-publish.yml` → npm package `@tyevco/homelab-lxc-agent` published (version patched from tag)

**Use conventional commits** so release-please picks up the right bump:
- `fix:` → patch bump
- `feat:` → minor bump
- `feat!:` or `BREAKING CHANGE:` → major bump

**Manual fallback** (if needed): `extra/update-version.ts` creates a `vX.Y.Z` tag manually:
```bash
VERSION=x.y.z npx tsx extra/update-version.ts
git push origin main --tags
```
