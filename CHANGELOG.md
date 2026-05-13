# Changelog

# [0.14.0](https://github.com/bonsaedev/nrg/compare/v0.13.1...v0.14.0) (2026-05-13)


### Bug Fixes

* add format property to TNodeRef and NRG schema extensions ([9a9894c](https://github.com/bonsaedev/nrg/commit/9a9894c51a70d596fb87c4e0686799471fa0d38d))
* add spacing between labels and inputs ([61813cc](https://github.com/bonsaedev/nrg/commit/61813ccd225842d1d9cf1e746786937a67c17e15))
* add tupleProp to getSchemaReferences return type ([d909cbb](https://github.com/bonsaedev/nrg/commit/d909cbbf0502ba5377945120f833ecfd296709df))
* add TypeScript types to Vue form components ([1bbd14e](https://github.com/bonsaedev/nrg/commit/1bbd14ea3c4efab16f328d80d45cfb160951329b))
* emit explicit types for factory-based node declarations ([8503852](https://github.com/bonsaedev/nrg/commit/850385296ec035c27f502fd9710c9485949debdc))
* export TNodeRef and TTypedInput from server entry ([6f5e25a](https://github.com/bonsaedev/nrg/commit/6f5e25a78777bd08c861e56ed5b6ad4f4afd1b21))
* merge array options instead of replacing them ([0e7061a](https://github.com/bonsaedev/nrg/commit/0e7061a23813854b32c685d1ab73ea413c0cb1da))
* restore external option on ServerBuildOptions ([94f7f9d](https://github.com/bonsaedev/nrg/commit/94f7f9df9e8cd16056c291920ce389767e625bda))


### Features

* add i18n support for framework toggle labels ([85f837d](https://github.com/bonsaedev/nrg/commit/85f837d9e37381ad4cb7940c2e58a9ee46e43a6b))
* add public sendToPort API for emit port messaging ([f20edcd](https://github.com/bonsaedev/nrg/commit/f20edcd57c6fcbdaba3a24e3ccf602c32fb1b427))
* auto-generate component type declarations for Volar ([2e40be7](https://github.com/bonsaedev/nrg/commit/2e40be7d1d0594d484d667353d855a74e41714a9))

## [0.13.1](https://github.com/bonsaedev/nrg/compare/v0.13.0...v0.13.1) (2026-05-10)


### Bug Fixes

* **test:** restore @bonsae/nrg/server import to prevent validator duplication ([d026baa](https://github.com/bonsaedev/nrg/commit/d026baa8f08c3769a27e8d3d4750ddf6b120ec70))

# [0.13.0](https://github.com/bonsaedev/nrg/compare/v0.12.1...v0.13.0) (2026-05-10)


### Bug Fixes

* **ci:** run build before e2e tests ([3985754](https://github.com/bonsaedev/nrg/commit/39857542d7c85b2281e0b076a8c2a55309f4595b))
* **test:** allow passing config nodes directly in config option ([fbc42f8](https://github.com/bonsaedev/nrg/commit/fbc42f8d50c9cd602ea524d665489668d7c68724))


### Features

* derive inputs/outputs from schemas instead of hardcoding ([837a30e](https://github.com/bonsaedev/nrg/commit/837a30eb16c073b02435541dec21c0c13b08cbc8))

## [0.12.1](https://github.com/bonsaedev/nrg/compare/v0.12.0...v0.12.1) (2026-05-08)


### Bug Fixes

* remove type checking from build plugin ([70221ba](https://github.com/bonsaedev/nrg/commit/70221ba72833399165d37bbcebcf882d19875e35))

# [0.12.0](https://github.com/bonsaedev/nrg/compare/v0.11.0...v0.12.0) (2026-05-08)


### Bug Fixes

* improve dev server restart reliability ([c13ff02](https://github.com/bonsaedev/nrg/commit/c13ff02229e2b0c960c83f423269f9398c967859))


### Features

* add optional error, complete, and status output ports to IONode ([5576d59](https://github.com/bonsaedev/nrg/commit/5576d5986f8c327c4850dfe3b9e35c732fc37edb))

# [0.11.0](https://github.com/bonsaedev/nrg/compare/v0.10.1...v0.11.0) (2026-05-05)


### Bug Fixes

* resolve form labels from locale catalog and support Union literals ([218e0cd](https://github.com/bonsaedev/nrg/commit/218e0cd7a05d1c02de7f23c73cd1d9c7fe729298))


### Features

* add paletteLabel, inputLabels, outputLabels to labels JSON schema ([58ac35d](https://github.com/bonsaedev/nrg/commit/58ac35dfe315ddb853f29a26ef70581b77f34738))
* resolve paletteLabel, inputLabels, outputLabels from locale files ([62f5595](https://github.com/bonsaedev/nrg/commit/62f5595c465899911345eb18479ed3748d090da6))
* translate auto-generated help docs and output as HTML ([a449c29](https://github.com/bonsaedev/nrg/commit/a449c29f83001101186eaf4a2b8f203517792870))

## [0.10.1](https://github.com/bonsaedev/nrg/compare/v0.10.0...v0.10.1) (2026-05-04)


### Bug Fixes

* add vitest alias for self-referencing @bonsae/nrg/server import ([3dcce33](https://github.com/bonsaedev/nrg/commit/3dcce33f4e80cdda7020c359bf1c8a220b20e0a8))
* export initValidator as internal for test framework singleton sharing ([6426d75](https://github.com/bonsaedev/nrg/commit/6426d75b5e019fc63383230e462e4cee1eae9b50))

# [0.10.0](https://github.com/bonsaedev/nrg/compare/v0.9.1...v0.10.0) (2026-05-04)


### Features

* add @bonsae/nrg/test for server-side node testing ([1cd81a5](https://github.com/bonsaedev/nrg/commit/1cd81a56cd39c8fb1eceb6550b1312fd62d65fd9))

## [0.9.1](https://github.com/bonsaedev/nrg/compare/v0.9.0...v0.9.1) (2026-05-04)


### Bug Fixes

* refactor routes into typed Express handlers with allowlist ([e703458](https://github.com/bonsaedev/nrg/commit/e703458de86a9bbd960d6074d443e5e167bae4aa))

# [0.9.0](https://github.com/bonsaedev/nrg/compare/v0.8.1...v0.9.0) (2026-05-03)


### Features

* auto-generate help docs from schemas and labels ([9b1031e](https://github.com/bonsaedev/nrg/commit/9b1031e2a7d6ed616f2fd0c00aaa9274ccd71963))

## [0.8.1](https://github.com/bonsaedev/nrg/compare/v0.8.0...v0.8.1) (2026-05-02)


### Bug Fixes

* resolve node ID to instance in TypedInput node resolver ([5221bb3](https://github.com/bonsaedev/nrg/commit/5221bb38a9381ffc139f0ba6a2b496dc1301fd52))

# [0.8.0](https://github.com/bonsaedev/nrg/compare/v0.7.0...v0.8.0) (2026-05-02)


### Bug Fixes

* export NrgSchemaOptions so consumers get IntelliSense for x-nrg-form ([4ff7a03](https://github.com/bonsaedev/nrg/commit/4ff7a035b4213e4811bd82aea253fba24dab9e86))


### Features

* resolve TypedInput properties via config proxy ([2de2d6e](https://github.com/bonsaedev/nrg/commit/2de2d6ea30e160f1dbbad8ae9c0b169f0e4cf542))

# [0.7.0](https://github.com/bonsaedev/nrg/compare/v0.6.3...v0.7.0) (2026-05-02)


### Bug Fixes

* preserve password value for validation when not yet deployed ([5e755cd](https://github.com/bonsaedev/nrg/commit/5e755cde4f2143447f6c44e8b3b0f10546fe88b1))
* validate config node references and show errors for unset refs ([1fae0c2](https://github.com/bonsaedev/nrg/commit/1fae0c252a389a1451874e8def0bd83fcd5c4467))


### Features

* integrate schema validation with Node-RED error triangle ([d9159ef](https://github.com/bonsaedev/nrg/commit/d9159ef825c6b67fed4649e571ae1c8b48f974bd))

## [0.6.3](https://github.com/bonsaedev/nrg/compare/v0.6.2...v0.6.3) (2026-04-30)


### Bug Fixes

* preserve generic types in factory return for NodeRef inference ([0857cd8](https://github.com/bonsaedev/nrg/commit/0857cd867dbdee86f632a5d1aca995c6b52bab88))

## [0.6.2](https://github.com/bonsaedev/nrg/compare/v0.6.1...v0.6.2) (2026-04-30)


### Bug Fixes

* publish dist/ as package root via semantic-release ([2cc7936](https://github.com/bonsaedev/nrg/commit/2cc793615563567b967158794cca22ef25bad471))
* ship bundled .d.ts declarations and inline TypeBox types ([fb4c916](https://github.com/bonsaedev/nrg/commit/fb4c9167c474eb07e5a0b1b0eb71731bc6bdcd8b))

## [0.6.1](https://github.com/bonsaedev/nrg/compare/v0.6.0...v0.6.1) (2026-04-29)


### Bug Fixes

* fix declaration emit for factory-defined nodes ([28c7a75](https://github.com/bonsaedev/nrg/commit/28c7a757a466a119199e27b681c1b3bea4481f37))
* generate schema type exports for all nodes in declarations ([ae88856](https://github.com/bonsaedev/nrg/commit/ae8885610742c7532e3887873cce87aa65e2d8b8))

# [0.6.0](https://github.com/bonsaedev/nrg/compare/v0.5.4...v0.6.0) (2026-04-29)


### Features

* add defineIONode and defineConfigNode factory functions ([df7ecb2](https://github.com/bonsaedev/nrg/commit/df7ecb2acd14e233c651c19b79373b95eb0355c8))
* add defineModule for typed server entry exports ([f7db901](https://github.com/bonsaedev/nrg/commit/f7db90103b12da7605659ae334b007cc5a65192b))
* add NodeRedToggle component with x-nrg-form toggle support ([bf813bd](https://github.com/bonsaedev/nrg/commit/bf813bd0f509149dfa2ed54a538364baac2492f9))

## [0.5.4](https://github.com/bonsaedev/nrg/compare/v0.5.3...v0.5.4) (2026-04-28)


### Bug Fixes

* add missing array-text to FormField inputType union ([b9097d6](https://github.com/bonsaedev/nrg/commit/b9097d6fa265acfe899c43d91748b433829da269))
* disconnect MutationObserver on typed input unmount ([fc5932d](https://github.com/bonsaedev/nrg/commit/fc5932d1af41bf6de91ef3b8d45b412cb6a65669))
* guard auto-generated entry cleanup in client build ([aa9377c](https://github.com/bonsaedev/nrg/commit/aa9377c44ed87ef147cf18786cb55959d35c62c1))
* guard configSchema access in oneditprepare validation schema ([54bea18](https://github.com/bonsaedev/nrg/commit/54bea187f0752ed4dc3144f7d9b1e7d574f3f1e1))
* guard node._def.defaults access with nullish coalescing ([ed71c2f](https://github.com/bonsaedev/nrg/commit/ed71c2f970cb76aded119a42578ace97ef5da143))
* remove debug console.log statements from client registration ([a35b4d4](https://github.com/bonsaedev/nrg/commit/a35b4d4aad96a205cf1afc06431b2469123ff1df))
* use optional chaining on error.parentSchema in validation ([cb5be44](https://github.com/bonsaedev/nrg/commit/cb5be4430b797b12c3d56aba076d6b29ee8fa71b))

## [0.5.3](https://github.com/bonsaedev/nrg/compare/v0.5.2...v0.5.3) (2026-04-27)


### Bug Fixes

* add set trap to config proxy to prevent accidental mutations ([7f18bd1](https://github.com/bonsaedev/nrg/commit/7f18bd1afc1a83d57b8c2728457cafc3526ee066))
* cache proxied config objects with WeakMap for reference equality ([003ca7d](https://github.com/bonsaedev/nrg/commit/003ca7d92d05ffbcf98f41227650bff5a555f257))
* make _node back-reference non-writable ([64c2d3b](https://github.com/bonsaedev/nrg/commit/64c2d3bdb7b57bbba216ee2fee80340985b857bb))
* use path.relative for traversal check in asset server ([5a258cd](https://github.com/bonsaedev/nrg/commit/5a258cdda67ba4b994d45841385a0fa4b5730435))
* use schema x-nrg-node-type to resolve node references in config proxy ([3da3dab](https://github.com/bonsaedev/nrg/commit/3da3dab7ff06a1f895cea610a4aaadfdfa071ab4))

## [0.5.2](https://github.com/bonsaedev/nrg/compare/v0.5.1...v0.5.2) (2026-04-26)


### Bug Fixes

* serve Vue dev build in development for devtools support ([85c30d5](https://github.com/bonsaedev/nrg/commit/85c30d54bc4505a7b44b459db3bd80fa43f38819))

## [0.5.1](https://github.com/bonsaedev/nrg/compare/v0.5.0...v0.5.1) (2026-04-26)


### Bug Fixes

* correct expand button position in editor input with label slot ([feeb9a1](https://github.com/bonsaedev/nrg/commit/feeb9a1569d3abc1e91271993e5c113ad4eab1b2))
* show type check errors in build output ([2048362](https://github.com/bonsaedev/nrg/commit/20483628bce0fd9dfda0ed56cce8d683bbbd789f))

# [0.5.0](https://github.com/bonsaedev/nrg/compare/v0.4.0...v0.5.0) (2026-04-25)


### Bug Fixes

* prevent restart loop when client entry is auto-generated ([d07e99c](https://github.com/bonsaedev/nrg/commit/d07e99c19f4b47abe44fbc52552d9a52829e6b0f))


### Features

* add NodeRedInputLabel component with label slot and x-node-red-input-label-icon support ([1d8e4fc](https://github.com/bonsaedev/nrg/commit/1d8e4fcf52468e1e3dd6602b0892d66fe40af8b4))

# [0.4.0](https://github.com/bonsaedev/nrg/compare/v0.3.0...v0.4.0) (2026-04-25)


### Features

* improve RED type definitions for server and client ([ea675ad](https://github.com/bonsaedev/nrg/commit/ea675ad81ffe505e9748f9b2abf15a40565c42ce))

# [0.3.0](https://github.com/bonsaedev/nrg/compare/v0.2.0...v0.3.0) (2026-04-24)


### Features

* move defineRuntimeSettings to root @bonsae/nrg export ([df5c6fc](https://github.com/bonsaedev/nrg/commit/df5c6fc4dc6370582ab7d041aab6f6253efe7c09))

# [0.2.0](https://github.com/bonsaedev/nrg/compare/v0.1.0...v0.2.0) (2026-04-24)


### Bug Fixes

* disable client sourcemaps in production and fix minifier warning ([9ef9d7c](https://github.com/bonsaedev/nrg/commit/9ef9d7ceaff45e986e0736709b0bc98ffca4fc1b))
* generate sourcemap in client minifier plugin ([5adbc2c](https://github.com/bonsaedev/nrg/commit/5adbc2cb60659d7f73d50689f209809173b1da3a))


### Features

* add lang and types options to SchemaType and support string editor in form ([6382fb2](https://github.com/bonsaedev/nrg/commit/6382fb227d2952fd83ab1b1b6cf4379ce880d2d1))
* **docs:** add getting started guide and API documentation ([84a124d](https://github.com/bonsaedev/nrg/commit/84a124d2704dc091ae0869d189c018a7a70efada))
* **docs:** add VitePress site with custom dark theme and GitHub Pages workflow ([2c52813](https://github.com/bonsaedev/nrg/commit/2c5281359570a709c03f6ed8d3f721f8dc8d8dde))
* generate separate node definition files for browser devtools ([19d9419](https://github.com/bonsaedev/nrg/commit/19d9419e7679f6f8eae2a593092a43f1e86a3161))

# [0.1.0](https://github.com/bonsaedev/nrg/compare/v0.0.0...v0.1.0) (2026-04-23)


### Features

* initial release ([6d3d4bd](https://github.com/bonsaedev/nrg/commit/6d3d4bd412a94367257b7c74191be601567294da))
