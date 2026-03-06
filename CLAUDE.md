# Homelab – Claude Notes

## Releasing a New Version

When bumping the version, **both** packages must be updated together:

- `package.json` (root — main homelab app)
- `lxc-agent/package.json` (LXC agent — published to npm as `@tyevco/homelab-lxc-agent`)

The `extra/update-version.ts` script handles this automatically when run with `VERSION=x.y.z`.

After bumping, also push a `lxc-agent-vX.Y.Z` tag to trigger the npm publish workflow:

```bash
git tag lxc-agent-vX.Y.Z
git push origin lxc-agent-vX.Y.Z
```
