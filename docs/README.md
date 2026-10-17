# Nitro documentation

The [Nitro documentation](https://nitro.margelo.com) uses [Docusaurus](https://docusaurus.io/). Its source lives in `margelo/nitro` on `core-split` while the repository split is in progress.

## Development

From the Nitro repository root:

```sh
bun install --frozen-lockfile --ignore-scripts
bun docs start
```

The docs do not need the native packages or Nitrogen to be built. Docusaurus reloads the site when files change.

## Validation

```sh
bun docs typecheck
bun docs build
```

The build writes the site to `docs/build/`. Preview it with `bun docs serve`.

## Deployment

The Vercel project must use `margelo/nitro` with `docs` as its root directory and access to the repository's root `bun.lock`. `vercel.json` installs the locked dependencies without running workspace build scripts, then runs `bun run build` from `docs/`.

Use `core-split` for preview deployments until the split is merged. Changing the Git repository or production branch in Vercel is a separate deployment setting; moving this directory does not change it.
