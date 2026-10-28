# Contributing

Thanks for helping improve the Vaartix Node.js SDK.

```sh
npm install
npm test          # unit tests
npm run lint      # formatting and lint (Biome)
npm run typecheck
npm run build
```

- Open an issue first for anything larger than a small fix, so we can agree on the approach.
- Keep the SDK dependency-free at runtime. Optional integrations (like React Email) are optional
  peer dependencies, loaded only when used.
- Every method resolves to `{ data, error }` and never throws for API or network errors; keep it
  that way.
- Add a line to `CHANGELOG.md` under "Unreleased".
