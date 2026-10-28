# Releasing

Releases are staged on npm by GitHub Actions when a version tag is pushed, then a maintainer
approves them with their npm 2FA code. No npm token exists, and nobody can release through GitHub
alone.

1. Update `version` in `package.json` and `VERSION` in `src/client.ts`, and move the "Unreleased"
   notes in `CHANGELOG.md` under the new version. Merge that to `main` through a pull request.
2. Tag the merge commit and push the tag:
   ```sh
   git checkout main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```
3. The **Publish to npm** workflow checks the tag matches the version, runs the tests and stages
   the release. It is not public yet.
4. Approve it from your computer, with a recent npm (`npm install -g npm@latest` first):
   ```sh
   npm login
   npm stage list vaartix          # shows the staged version and its stage ID
   npm stage approve <stage-id>    # asks for your 2FA code, then publishes
   ```
   If something looks wrong, `npm stage download <stage-id>` lets you inspect the tarball first,
   and `npm stage reject <stage-id>` throws it away.

## One-time setup (done once by a maintainer)

- npmjs.com → `vaartix` → **Settings** → **Trusted Publisher** → GitHub Actions: organization or
  user `vaartix-mail`, repository `vaartix-node`, workflow `publish.yml`, environment `npm`. Leave
  "Allow npm publish" and "Allow npm dist-tag" unticked, so it can only stage.
- Same page → **Publishing access** → "Require two-factor authentication and disallow tokens".
- GitHub → **Settings** → **Environments** → `npm` → deployment branches and tags: `v*` tags only.
