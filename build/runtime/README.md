<p align="center">
  <img alt="nrg-icon" src="https://gist.githubusercontent.com/AllanOricil/bad08acfef9f693e6cc28ec82b151672/raw/8118f6022bd5ccdce066abc398611b2a8aa93e81/nrg-icon-banner.svg"/>
</p>
<p align="center">
  <a href="https://www.npmjs.com/package/@bonsae/nrg-runtime"><img src="https://img.shields.io/npm/v/@bonsae/nrg-runtime.svg" alt="npm package"></a>
  <a href="https://github.com/bonsaedev/nrg/actions/workflows/ci.yaml"><img src="https://github.com/bonsaedev/nrg/actions/workflows/ci.yaml/badge.svg?branch=main" alt="build status"></a>
  <a href="https://codecov.io/gh/bonsaedev/nrg"><img src="https://codecov.io/gh/bonsaedev/nrg/graph/badge.svg" alt="codecov"/></a>
  <a href="https://socket.dev/npm/package/@bonsae/nrg-runtime"><img src="https://badge.socket.dev/npm/package/@bonsae/nrg-runtime?v=1" alt="Socket Badge"></a>
</p>

# @bonsae/nrg-runtime

The runtime for Node-RED nodes built with [`@bonsae/nrg`](https://www.npmjs.com/package/@bonsae/nrg) — node base classes, JSON Schema types, the AJV validator, and the editor client runtime. It carries only what a built node needs at runtime (TypeBox, AJV, Vue) and **none** of the build tooling (no Vite/esbuild/TypeScript).

> [!NOTE]
> You normally don't install this directly. `@bonsae/nrg` depends on it, and a node you build declares `@bonsae/nrg-runtime` (not the toolkit) as its only nrg dependency — so installing a built node pulls just this small runtime, never the authoring toolchain.

## What's inside

- Node base classes (`IONode`, `Node`, `ConfigNode`) and type registration
- `SchemaType` (TypeBox) schema builders and the AJV validator
- The editor client runtime (form rendering and validation), served as a static asset

## Versioning

Published lockstep with `@bonsae/nrg` at the same version. While nrg is at `v0`, breaking changes can land in any release without a major bump — pin an exact version and review the [changelog](https://github.com/bonsaedev/nrg/blob/main/CHANGELOG.md) before upgrading.

## License

See [LICENSE](./LICENSE).
