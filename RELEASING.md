# Releasing

Releases are published to npm by GitHub Actions when a version tag is pushed. Nobody publishes from
their own computer, and no npm token exists.

1. Update `version` in `package.json` and `VERSION` in `src/client.ts`, and move the "Unreleased"
   notes in `CHANGELOG.md` under the new version. Merge that to `main` through a pull request.
2. Tag the merge commit and push the tag:
   ```sh
   git checkout main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. Approve the run when GitHub asks (**Actions** → **Publish to npm** → **Review deployments**).
   It checks the tag matches the version, runs the tests and publishes with provenance.

## One-time setup (done once by a maintainer)

- npmjs.com → `vaartix` → **Settings** → **Trusted Publisher** → GitHub Actions: organization or
  user `vaartix-mail`, repository `vaartix-node`, workflow `publish.yml`, environment `npm`.
- Same page → **Publishing access** → "Require two-factor authentication and disallow tokens".
- GitHub → **Settings** → **Environments** → `npm` → required reviewer: a maintainer; deployment
  tags: `v*` only.
