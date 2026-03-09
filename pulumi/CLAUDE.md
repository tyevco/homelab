# Project Instructions

## Commit Message Format

This project uses [Conventional Commits](https://www.conventionalcommits.org/) to drive automated versioning via release-please.

Always use the following format for commit messages:

```
<type>[optional scope]: <description>
```

### Types

- `feat:` — new feature (bumps minor version)
- `fix:` — bug fix (bumps patch version)
- `chore:` — maintenance tasks (no version bump)
- `docs:` — documentation only (no version bump)
- `test:` — adding or updating tests (no version bump)
- `refactor:` — code refactoring (no version bump)
- `ci:` — CI/CD changes (no version bump)

### Breaking Changes

- Use `feat!:` or `fix!:` for breaking changes (bumps major version, or minor while pre-1.0)
- Alternatively, add a `BREAKING CHANGE:` footer to any commit

### Examples

```
feat: add Traefik middleware resource
fix: handle empty compose file gracefully
feat!: rename Stack resource to HomelabStack
chore: update dev dependencies
```
