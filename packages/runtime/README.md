<p align="center">
  <a href="https://www.npmjs.com/package/@bonsae/nrg-runtime"><img src="https://img.shields.io/npm/v/@bonsae/nrg-runtime.svg" alt="npm package"></a>
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
