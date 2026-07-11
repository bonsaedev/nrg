# Changelog

## [0.38.1](https://github.com/bonsaedev/nrg/compare/v0.38.0...v0.38.1) (2026-07-11)

### Bug Fixes

* **server:** preserve _msgid across every node and context mode ([05937e7](https://github.com/bonsaedev/nrg/commit/05937e7798984efa6665804dce6edd3a971801a7))

## [0.38.0](https://github.com/bonsaedev/nrg/compare/v0.37.0...v0.38.0) (2026-07-10)

### Features

* **vite:** tag every built node package with the "bonsae" keyword ([be5bed2](https://github.com/bonsaedev/nrg/commit/be5bed2c18f4662f482eddc00f402ff7c673fb53))

## [0.37.0](https://github.com/bonsaedev/nrg/compare/v0.36.0...v0.37.0) (2026-07-10)

### Features

* **client:** polish the config form's data-schema editor ([c474ff6](https://github.com/bonsaedev/nrg/commit/c474ff64e762a8953674d89846f63dc8aea0a29d))
* **server:** rework the node output message envelope ([ee11b94](https://github.com/bonsaedev/nrg/commit/ee11b94340e145c0f33a588cd3ebb8e7674758ae))
* **vite:** emit node-types.json in dev builds ([e6f0832](https://github.com/bonsaedev/nrg/commit/e6f08322b3ea718f3d9e2fe0b0579ae8a01cf2ca))
* **vite:** enrich node help from default input/output validation schemas ([b5cfd5c](https://github.com/bonsaedev/nrg/commit/b5cfd5c5ce9be781529d0764c93402bd5d33689d))
* **vite:** enrich type-driven node help rendering ([d3f2154](https://github.com/bonsaedev/nrg/commit/d3f2154de7a80bca0e646f190482ded11033fe1c))
* **vite:** group the built-in ports into one Lifecycle outputs table ([7f81255](https://github.com/bonsaedev/nrg/commit/7f812557e3b4b86fec82658d9677bbf7c4f57e5e))
* **vite:** quieter, clearer dev-server output ([9e5f07a](https://github.com/bonsaedev/nrg/commit/9e5f07a57f0d485a8fbd736304c597fd205bade1))
* **vite:** recover NodeRef/TypedInput type args for node help ([422e024](https://github.com/bonsaedev/nrg/commit/422e02477c88c9dc4abe512d5dea3b1567468d6e))
* **vite:** render outputs as one consistent Port|Type table ([dc49109](https://github.com/bonsaedev/nrg/commit/dc49109f6dc96ca04c882d437650e644a4fbd648))
* **vite:** render the Complete port like Error/Status (inline shape) ([b9fd31f](https://github.com/bonsaedev/nrg/commit/b9fd31fa95a8ac0f237df3aabd81c7be297da87c))

### Bug Fixes

* **client:** persist a cleared per-port field instead of reverting ([f315987](https://github.com/bonsaedev/nrg/commit/f315987bd5476ff79f8dbfc82882a9bc5b4aef35))
* **vite:** keep Node-RED on a stable port across dev restarts ([7904192](https://github.com/bonsaedev/nrg/commit/79041923b28ebcbbcf6d767faa8b12756a5608ca))

### Refactors

* **vite:** drop the redundant Capabilities section from node help ([4726d4a](https://github.com/bonsaedev/nrg/commit/4726d4a347bc3a1b5b341374369ed7826f17655e))
* **vite:** fold roleSection into a settings-only helper ([9a580e4](https://github.com/bonsaedev/nrg/commit/9a580e4b7bc941e6b8613a987bd9172d2b57818c))

### Documentation

* add a Message Flow section to Why NRG ([c340c74](https://github.com/bonsaedev/nrg/commit/c340c74a240614624d164b36b4517d4c46de8489))
* fix code drift and clarify the guide for beginners ([df4ad34](https://github.com/bonsaedev/nrg/commit/df4ad340db2d9c2c725744cfef1558111eed9c47))
* simplify the README to the scaffold + one node example ([bcdabc0](https://github.com/bonsaedev/nrg/commit/bcdabc07821446e6a68779fbc5ffcf0c15b7fe8f))

## [0.36.0](https://github.com/bonsaedev/nrg/compare/v0.35.1...v0.36.0) (2026-07-08)

### Features

* **client:** expose typed Monaco editor options as a public NodeRedEditorInput prop ([3f5499c](https://github.com/bonsaedev/nrg/commit/3f5499cec52822ee67d6c989e5b8bd90f7a09e96))
* **client:** show the schema error live inside the editor tray ([db3a2ce](https://github.com/bonsaedev/nrg/commit/db3a2ceb03a035d114f98219527da4d2c9dad9da))
* **client:** use the official JSON Schema logo on the Schema button ([aa2b290](https://github.com/bonsaedev/nrg/commit/aa2b290d20cf4e0d19c041dab02f9f1953cf9450))
* **client:** validate flow-author input/output schemas in the editor ([0938c2c](https://github.com/bonsaedev/nrg/commit/0938c2c62cf1b7d88209ee6bc9cdecdec367fdce))
* **schema:** accept a SchemaType schema as an input/output validation default ([3a19e6c](https://github.com/bonsaedev/nrg/commit/3a19e6c60826ee3a858a97187e7a646959415bee))

### Bug Fixes

* **client:** unwrap the Validate Data header and move schema errors below the table ([6d28f85](https://github.com/bonsaedev/nrg/commit/6d28f8519e68b5e36d2dc51256c80c1157573611))

### Documentation

* fix e2e vitest config to spread nrg.test, not mergeConfig ([6626d83](https://github.com/bonsaedev/nrg/commit/6626d833832f38e3d32e32aea6a647835ad3cb71))
* refresh editor screenshots to show the JSON Schema logo ([6e838e3](https://github.com/bonsaedev/nrg/commit/6e838e3bd4b3bca7a06b6bd8998911d310181c87))
* sell async input scoping and lifecycle ports in why-nrg ([ace347f](https://github.com/bonsaedev/nrg/commit/ace347f38d439d050a956fac6ac0179989338697))

## [0.35.1](https://github.com/bonsaedev/nrg/compare/v0.35.0...v0.35.1) (2026-07-08)


### Bug Fixes

* **test:** keep sent() readable for never-input source nodes ([5c0b239](https://github.com/bonsaedev/nrg/commit/5c0b2391a49ad39f8791c9cf320d0f7324ec77ac))

# [0.35.0](https://github.com/bonsaedev/nrg/compare/v0.34.0...v0.35.0) (2026-07-08)


### Features

* any/unknown make an untyped port; only never/void/undefined suppress it ([d385d88](https://github.com/bonsaedev/nrg/commit/d385d888e5d113c5ff5888a709e534160965b43d))
* **client:** use a { } glyph for the Schema button icon ([c8ed092](https://github.com/bonsaedev/nrg/commit/c8ed0923401e0b4bab865ef5e9be947ba77cb8b2))

# [0.34.0](https://github.com/bonsaedev/nrg/compare/v0.33.0...v0.34.0) (2026-07-07)


### Bug Fixes

* **build:** hide inputSchema/outputSchemas from generated node help docs ([ee026d1](https://github.com/bonsaedev/nrg/commit/ee026d10d4d276fec18cbfb5a73cb07818deada1))
* mark node input() with override (base tsconfig has noImplicitOverride) ([81fe3ea](https://github.com/bonsaedev/nrg/commit/81fe3ea02b7149211c8b29d12dbae999fb4dd8cb))
* **server:** memoize flow-author schema overrides + fail closed on a bad one ([179f012](https://github.com/bonsaedev/nrg/commit/179f01262d7fda3fec642c2f3804cfd7662a8a05))
* **server:** validate named-port sends (sendToPort) against the port schema ([00d1e01](https://github.com/bonsaedev/nrg/commit/00d1e01e43f60d461950cb9c8feb866503819a26))
* **test:** type types-first Port<T> named ports via OutputPortNames + surface extraction failures ([b0c0674](https://github.com/bonsaedev/nrg/commit/b0c067475377221c66fd578cdcdc86693573d000))
* **types:** preserve Port<> for named outputs in the emitted class decl ([d3c8924](https://github.com/bonsaedev/nrg/commit/d3c8924fe092ecc290116fd29005c99fb49a6d6d))
* **types:** render a NodeRef config field as its config-node class, not unknown ([a859a25](https://github.com/bonsaedev/nrg/commit/a859a2571b8aba9f48413f2c0daf7e838ea847f3))


### Features

* **client:** a reusable NodeRedTray component for custom node forms ([bef8abd](https://github.com/bonsaedev/nrg/commit/bef8abda2d586653c130e94c0a87da3cb0d3eea3))
* **client:** input schema editor + render the schema tray as a Vue component ([6ff88e0](https://github.com/bonsaedev/nrg/commit/6ff88e05367467530d8d209b59249ab4b561e4c9))
* **client:** per-port output schema editor (Monaco tray) ([296c6a7](https://github.com/bonsaedev/nrg/commit/296c6a73d9cbf92ab8279e7a7bff6e0fd0cdc3e8))
* **server:** add Port<T> for declaring output ports in the Output generic ([cdccc71](https://github.com/bonsaedev/nrg/commit/cdccc71137b58c2fd4bea9fff4da537601c66633))
* **server:** derive node port topology from the Input/Output generics ([bd1f014](https://github.com/bonsaedev/nrg/commit/bd1f014ee068474c66255c95f9ac60decab4b589))
* **server:** validate input/output against flow-author schema overrides ([788a6d0](https://github.com/bonsaedev/nrg/commit/788a6d0e229493f56e49a0a6b80b2d60e6e26481))
* ship a default Prettier config in the toolkit ([1f86b78](https://github.com/bonsaedev/nrg/commit/1f86b78a8cdcf500742717c2315a8c2851e1cb3f))
* **test:** inject build-time port topology so types-only nodes test like built nodes ([4bf8e84](https://github.com/bonsaedev/nrg/commit/4bf8e84338a8ab7424fc30ebcbcc3e86d2360d49))
* **types:** emit per-node error/complete port envelopes in the wiring registry ([3b3f184](https://github.com/bonsaedev/nrg/commit/3b3f184cbeb7c05ef6f1f1bd3cf55f9394f1bf6f))
* **types:** treat an explicit `unknown` output as one untyped port ([532c04c](https://github.com/bonsaedev/nrg/commit/532c04c3e3f66188dcdd2e7d29852c6e9a566274))

# [0.33.0](https://github.com/bonsaedev/nrg/compare/v0.32.0...v0.33.0) (2026-07-05)


### Features

* **test:** expose a created() error as the createNode result `error` ([1ab9aec](https://github.com/bonsaedev/nrg/commit/1ab9aec4111e8d18aa103be030fa30ac46f4260b))

# [0.32.0](https://github.com/bonsaedev/nrg/compare/v0.31.0...v0.32.0) (2026-07-05)


### Bug Fixes

* fit the Input table to content, per-bullet Outputs help links ([aede7a5](https://github.com/bonsaedev/nrg/commit/aede7a5d744503280df8241748b4a5183234158b))
* resolve @/schemas in the server build ([366dfc9](https://github.com/bonsaedev/nrg/commit/366dfc97e6e91172d654d2921c73939357733518))
* **vite:** bundle Windows-absolute @/schemas paths instead of externalizing ([d2f94fd](https://github.com/bonsaedev/nrg/commit/d2f94fd3717eb1e15902c509d820c8472d0903f8))


### Features

* add a Capabilities table to generated node help docs ([ccd1ce6](https://github.com/bonsaedev/nrg/commit/ccd1ce60f8e6189d703aaacd6d2cdd6aeff5be2c))
* add the editor wire type-check client, gated on the optional plugin ([c9ce816](https://github.com/bonsaedev/nrg/commit/c9ce816633531282f8df03adb619ed7b2756da17))
* **client:** bake node schema onto each defineNode at build time ([ffe0b70](https://github.com/bonsaedev/nrg/commit/ffe0b70ec57bbd420d25f5311d60da980dffdf8a))
* derive node help docs from TypeScript types ([95f5e05](https://github.com/bonsaedev/nrg/commit/95f5e05cd9174a78ab86c0e0f59bbb2721bffc71))
* enforce unique schema $id at node registration ([3e583e1](https://github.com/bonsaedev/nrg/commit/3e583e1efe5206e8449cef69461ec86c076cf409))
* extend type-driven node docs to the functional API ([9c58682](https://github.com/bonsaedev/nrg/commit/9c58682fe7ec14cda437f93440c6bdd0abbcc076))
* generate a package type surface (inheritable classes + editor registry) ([5556baa](https://github.com/bonsaedev/nrg/commit/5556baa0a86537f9ffedaa8d7343b68bc9f23767))
* render node port types self-contained in the generated package d.ts ([fa6944e](https://github.com/bonsaedev/nrg/commit/fa6944e5a0aff34f5d6da16ad2307cb33e6df75e))
* **server:** export NodeTypes registry + built-in port types ([6cc3252](https://github.com/bonsaedev/nrg/commit/6cc3252a703a88484c3f250b9f32e76bd943e9d5))
* **server:** stop @bonsae/nrg/server re-exporting schema builders ([1b9476d](https://github.com/bonsaedev/nrg/commit/1b9476de5d6d6d799dd743b6e03d4bc88d9e102b))
* ship a @/schemas alias for consumer authoring code ([56aaa67](https://github.com/bonsaedev/nrg/commit/56aaa67892a93c7fbd31cd02fce02ee8f97b16b7))

# [0.31.0](https://github.com/bonsaedev/nrg/compare/v0.30.0...v0.31.0) (2026-06-30)


### Features

* **eslint:** make nrgConventions a complete drop-in flat config ([4a0b321](https://github.com/bonsaedev/nrg/commit/4a0b3216105cb1ab80839e289be27291539f941c))
* **eslint:** rename the @bonsae/nrg/eslint export from nrgConventions to nrg ([2050ec2](https://github.com/bonsaedev/nrg/commit/2050ec26aaa04405b6839a65b32d5917908437e4))

# [0.30.0](https://github.com/bonsaedev/nrg/compare/v0.29.0...v0.30.0) (2026-06-29)


### Bug Fixes

* compact the editor OUTPUTS table columns ([62434be](https://github.com/bonsaedev/nrg/commit/62434be224002bb61ca5e5992804e5a383253024))
* resolve editor output-port labels from the i18n catalog ([21e9cd2](https://github.com/bonsaedev/nrg/commit/21e9cd24077ffa04955f634f9e17a5ed4d9150a2))
* vertically center the toggle in form table cells ([9355f18](https://github.com/bonsaedev/nrg/commit/9355f1883cd54c744d16f40c7e4e10ddcb6aac5b))


### Features

* add a Label column to the editor Input table ([a615cbf](https://github.com/bonsaedev/nrg/commit/a615cbfa3e0ae5bf81a44c3b1275b7916749a9e8))
* enforce a valid default type on TypedInput schemas ([03a6b60](https://github.com/bonsaedev/nrg/commit/03a6b60dc2876f40be832274529190d037992082))
* lifecycle output-ports settings table and form layout refinements ([c10b10e](https://github.com/bonsaedev/nrg/commit/c10b10ea54996009ebac6f144b74071014f238c6))
* render the Input section as a table ([d108e32](https://github.com/bonsaedev/nrg/commit/d108e32c2fde36d6a5683133e42a5866a5c80178))

# [0.29.0](https://github.com/bonsaedev/nrg/compare/v0.28.1...v0.29.0) (2026-06-29)


### Features

* allow per-port validateOutput via boolean[] ([839532c](https://github.com/bonsaedev/nrg/commit/839532c8f081515df5c11901860f759c1ed09e2f))
* **eslint:** guard schemas against value-importing server modules ([42c2abd](https://github.com/bonsaedev/nrg/commit/42c2abd59ddc320b611a85603f459c3ef45154ca))
* **schema:** add neutral @bonsae/nrg/schema entry for schema builders ([9b1a35c](https://github.com/bonsaedev/nrg/commit/9b1a35c3265794e1eeae6a1c9471befe3f627650))

## [0.28.1](https://github.com/bonsaedev/nrg/compare/v0.28.0...v0.28.1) (2026-06-28)


### Bug Fixes

* **vite:** resolve dev-vs-publish from vite command; build dev to .nrg ([7c28878](https://github.com/bonsaedev/nrg/commit/7c2887825565de40d45b7850a50b9291ede59ae2))

# [0.28.0](https://github.com/bonsaedev/nrg/compare/v0.27.0...v0.28.0) (2026-06-28)


### Features

* **eslint:** add a shared @bonsae/nrg/eslint config for node conventions ([258b58d](https://github.com/bonsaedev/nrg/commit/258b58d26ed7233594939002662fa1d95a3dc860))
* **vite:** adopt a src/resources convention, drop the locales/icons/copy configs ([ee7ce39](https://github.com/bonsaedev/nrg/commit/ee7ce39e43f15b4bebf98d6f0a83b7d8681dc66f))

# [0.27.0](https://github.com/bonsaedev/nrg/compare/v0.26.3...v0.27.0) (2026-06-28)


### Bug Fixes

* address code-review findings (dead banner, a11y, ESM build guard, cleanup) ([fc328bd](https://github.com/bonsaedev/nrg/commit/fc328bd01bda1a915ea5b268f50ea15f734ac605))
* **build:** whitelist published package.json fields ([cd18222](https://github.com/bonsaedev/nrg/commit/cd18222c02f54e1ab1e9e4ae2ad054e9c407f8c7))
* **client:** validate credentials-only nodes ([ca1a388](https://github.com/bonsaedev/nrg/commit/ca1a388b2f47e4fdcfc8e9298ccf16c54a198c06))
* **server:** dedup error port, surface real created() failure cause ([bdf53b3](https://github.com/bonsaedev/nrg/commit/bdf53b349ada5b00256080200409647a955f57ca))
* **server:** prune per-node context update lock map ([c33a687](https://github.com/bonsaedev/nrg/commit/c33a687cce8930effb214298b16b4b5fb068161d))
* **server:** warn on cleartext credential fields ([9eaa94b](https://github.com/bonsaedev/nrg/commit/9eaa94b92bd06da01a178058025ddaa1fb2be398))


### Features

* **client:** edit object config fields in a Monaco JSON editor ([f369892](https://github.com/bonsaedev/nrg/commit/f369892130d946898e1dd1c1c6058fa8858422cd))
* **schemas:** unify NodeRef, decouple authoring into core/shared, constrain to config nodes ([1af7000](https://github.com/bonsaedev/nrg/commit/1af70001dc765032b1bf8e5856fb5f8ce69b0255))

## [0.26.3](https://github.com/bonsaedev/nrg/compare/v0.26.2...v0.26.3) (2026-06-27)


### Bug Fixes

* **build:** externalize @bonsae/nrg/server in the integration bundle ([774c1bb](https://github.com/bonsaedev/nrg/commit/774c1bb987c4bc5aeb2872df80da34b6e06b7f43))

## [0.26.2](https://github.com/bonsaedev/nrg/compare/v0.26.1...v0.26.2) (2026-06-27)


### Bug Fixes

* **build:** define __dirname in the ESM server-test bundles so they boot ([08ae930](https://github.com/bonsaedev/nrg/commit/08ae9306200589c83f08e97dda4d449c9c77ee5c))

## [0.26.1](https://github.com/bonsaedev/nrg/compare/v0.26.0...v0.26.1) (2026-06-27)


### Bug Fixes

* **server:** pin the ajv deep import to .js so ESM consumers resolve it ([930104d](https://github.com/bonsaedev/nrg/commit/930104d826913e29ba8164d8435d667afea7fdcc))

# [0.26.0](https://github.com/bonsaedev/nrg/compare/v0.25.1...v0.26.0) (2026-06-27)


### Bug Fixes

* **client:** align outputs help text with the "Validate Data" rename ([d3f4542](https://github.com/bonsaedev/nrg/commit/d3f45427b938205c35638b5136fb5ef0cf85c8d5))
* **test:** resolve packed tarball paths against the pack cwd in vite-integration ([d70fc0a](https://github.com/bonsaedev/nrg/commit/d70fc0a372f0b992b5b3147975d7db6d9268725f))


### Features

* **client:** refine the editor outputs form and rename Validate to "Validate Data" ([ddf9636](https://github.com/bonsaedev/nrg/commit/ddf963648cf007a5dab407d2bad5244c06d4fbaa))
* **schemas:** autocomplete ajv string formats on SchemaType.String ([d80b951](https://github.com/bonsaedev/nrg/commit/d80b9516945826c72be0550846046f9fd1ca4c87))
* **test:** resolve component-test schemas from the node registry ([5b4c5e6](https://github.com/bonsaedev/nrg/commit/5b4c5e6e142631b9bf9e414bca04f5d45a50e4fc))

## [0.25.1](https://github.com/bonsaedev/nrg/compare/v0.25.0...v0.25.1) (2026-06-25)


### Bug Fixes

* **runtime:** scope per-input context to each input() call ([817e2c3](https://github.com/bonsaedev/nrg/commit/817e2c371e78ef0fd706e71f6642d3acab98e202))

# [0.25.0](https://github.com/bonsaedev/nrg/compare/v0.24.0...v0.25.0) (2026-06-24)


### Features

* **runtime:** carry thrown custom-error fields on the error port ([decd691](https://github.com/bonsaedev/nrg/commit/decd69101598e9c7c1e175827735cb6c098b42aa))
* **test:** resolve built-in lifecycle ports by name in sent() ([c66b6b0](https://github.com/bonsaedev/nrg/commit/c66b6b097fea9f475e348ffc1408d21561cf1fa8))

# [0.24.0](https://github.com/bonsaedev/nrg/compare/v0.23.0...v0.24.0) (2026-06-24)


### Features

* **runtime:** let input() return a custom continue message on the complete port ([535bd09](https://github.com/bonsaedev/nrg/commit/535bd09e0ad9a7773cdd9c154214cb746487399d))

# [0.23.0](https://github.com/bonsaedev/nrg/compare/v0.22.2...v0.23.0) (2026-06-23)


### Features

* **test:** type node.sent() positionally from the node's declared output ([616f91e](https://github.com/bonsaedev/nrg/commit/616f91e4dc914d2d3602f3e2f5c61451191bfbe0))

## [0.22.2](https://github.com/bonsaedev/nrg/compare/v0.22.1...v0.22.2) (2026-06-23)


### Bug Fixes

* **toolkit:** own and publish nrg types in the toolkit's ESM context ([b342cf4](https://github.com/bonsaedev/nrg/commit/b342cf4b6ae9a2513c81b7bf4ce6c2535b3d0ed7))

## [0.22.1](https://github.com/bonsaedev/nrg/compare/v0.22.0...v0.22.1) (2026-06-22)


### Bug Fixes

* **toolkit:** ship client type shims in the published package ([c9802e7](https://github.com/bonsaedev/nrg/commit/c9802e779009dff1a2e39aa4f5cec3a15ce1cf71))


### Performance Improvements

* **build:** minify the built client asset ([16bd82f](https://github.com/bonsaedev/nrg/commit/16bd82f1dd542f71b0f2fb2268a612964b8915cd))

# [0.22.0](https://github.com/bonsaedev/nrg/compare/v0.21.2...v0.22.0) (2026-06-22)


### Bug Fixes

* **deps:** make browser test tools optional peers, not dependencies ([b33f3a2](https://github.com/bonsaedev/nrg/commit/b33f3a2cfd33defdeb5a9e5abfd21363341c2763))
* publish package contents at the root, plus schema and peer-dep fixes ([4675587](https://github.com/bonsaedev/nrg/commit/4675587ace48c0a1a9eb9fea5b8d49ae832dba58))
* ship LICENSE in the published package, add bugs + canonical repo url ([ab67f86](https://github.com/bonsaedev/nrg/commit/ab67f86e592ebd815861f71a7318a1424445368a))
* support pnpm dev and devDependency installs after the split ([78a9570](https://github.com/bonsaedev/nrg/commit/78a9570545efc4bb024b97e3a321dc60a4630dc3))
* widen IONodeStatus to valid Node-RED status fills and shapes ([28671c3](https://github.com/bonsaedev/nrg/commit/28671c3af0888c5dfc10e9aa75e5dc438ba571e7))


### Features

* atomic increment/update on node context ([bb064fa](https://github.com/bonsaedev/nrg/commit/bb064fa310b590b0b3d532475b2f25eb0966c44c))
* recover Unsafe<T>() types into generated node docs at build time ([8f379e1](https://github.com/bonsaedev/nrg/commit/8f379e115edc76e6219ab52abe94778d447c7ab7))
* split @bonsae/nrg into toolkit and runtime packages ([3ee058c](https://github.com/bonsaedev/nrg/commit/3ee058c9849566817efea97613a9fad948d8aa18))

## [0.21.2](https://github.com/bonsaedev/nrg/compare/v0.21.1...v0.21.2) (2026-06-13)


### Bug Fixes

* resolve named output port labels server-side, not by guessing the schema ([6b57954](https://github.com/bonsaedev/nrg/commit/6b579545ae51f3644f3ca05e5ebbbdbc51db302c))

## [0.21.1](https://github.com/bonsaedev/nrg/compare/v0.21.0...v0.21.1) (2026-06-12)


### Bug Fixes

* drive context mode from config schema, not a send() option ([9af61b7](https://github.com/bonsaedev/nrg/commit/9af61b73438423dbc702f5768bc2439c68a08d7e))

# [0.21.0](https://github.com/bonsaedev/nrg/compare/v0.20.1...v0.21.0) (2026-06-12)


### Features

* per-port output settings in a sectioned editor form ([0c368e1](https://github.com/bonsaedev/nrg/commit/0c368e1e0e7fe47867c494797c1f8bac2944d626))

## [0.20.1](https://github.com/bonsaedev/nrg/compare/v0.20.0...v0.20.1) (2026-06-12)


### Bug Fixes

* declare the vite plugin export as nrg in the generated types ([3587a40](https://github.com/bonsaedev/nrg/commit/3587a409fe44bba5c59b63b9b60ac1ce20f0493e))

# [0.20.0](https://github.com/bonsaedev/nrg/compare/v0.19.1...v0.20.0) (2026-06-12)


### Bug Fixes

* map @bonsae/nrg/server to source in the repo tsconfig ([24c7d50](https://github.com/bonsaedev/nrg/commit/24c7d50db432a375ef5c7ca1056a1ec134a445c1))


### Features

* expose node context in the unit test harness ([6877547](https://github.com/bonsaedev/nrg/commit/6877547a77944aca24122d3b9b560f5916b6fc2a))
* server integration testing library ([9503e59](https://github.com/bonsaedev/nrg/commit/9503e591316379a9064659f2da6a8f3957b0e429))
* ship a default include in every test config and align the docs ([d50e9f2](https://github.com/bonsaedev/nrg/commit/d50e9f2131ad2274298d60fd5e51a7e011c6fafd))

## [0.19.1](https://github.com/bonsaedev/nrg/compare/v0.19.0...v0.19.1) (2026-06-11)


### Bug Fixes

* remove the dev-server editor path slug ([08ff547](https://github.com/bonsaedev/nrg/commit/08ff547a7a613880182624839d6038135cb60202))

# [0.19.0](https://github.com/bonsaedev/nrg/compare/v0.18.5...v0.19.0) (2026-06-11)


### Bug Fixes

* disable editor tours in generated runtime settings ([8911336](https://github.com/bonsaedev/nrg/commit/89113369812b9b0b33f905e855df5de3032332eb))
* emit vue-dts declarations under dist instead of beside sources ([9d0d5bf](https://github.com/bonsaedev/nrg/commit/9d0d5bf2917f985693e44d85936e8ef6228b18c5))
* guard expanded-editor tray callbacks against teardown ([fa2fbfc](https://github.com/bonsaedev/nrg/commit/fa2fbfcfff580d6f7461ec97596e9e9779441f6f))
* rename editor instance ref to avoid template ref collision ([83f420d](https://github.com/bonsaedev/nrg/commit/83f420dea32ba566c68abb48580d28b9b82fa115))


### Features

* add RED.nodes.addCredentials to types and the server test mock ([8107167](https://github.com/bonsaedev/nrg/commit/81071671f9406955802fdad72ec6814d19684e1a))
* e2e helpers for config trays, canvas, deploy and code editors ([866836a](https://github.com/bonsaedev/nrg/commit/866836a0a5778e48001af8d6c983b4d3201d6c79))
* implement the full editor RED contract in the client test mocks ([a538efa](https://github.com/bonsaedev/nrg/commit/a538efabc8eee7a3ab1fffc164767a29e7c844b0))
* path-slug dev server and regrouped vite plugin API ([131c1fa](https://github.com/bonsaedev/nrg/commit/131c1fa312c54cab86ca6353b5745f26f04260c1))
* reactive createNode with schema-driven validation for component tests ([2516fab](https://github.com/bonsaedev/nrg/commit/2516faba1f9fe09127820c66fd9b2064fac16f42))
* returnProperty built-in prop for framework-wrapped sends ([a45da78](https://github.com/bonsaedev/nrg/commit/a45da7872021e3a6ec200e11b0bbc3a304f14e49))
* share the schema vocabulary and type contracts across planes ([4b5b712](https://github.com/bonsaedev/nrg/commit/4b5b7129537b801d1b6711e892fc155b57b7b86b))

## [0.18.5](https://github.com/bonsaedev/nrg/compare/v0.18.4...v0.18.5) (2026-06-09)


### Bug Fixes

* document node-red resolution order and recommend as dev dependency ([812bda7](https://github.com/bonsaedev/nrg/commit/812bda7f9955d21ad69d8fa7ca09003b7545c978))
* handle errors in created and registered hooks gracefully ([315790b](https://github.com/bonsaedev/nrg/commit/315790b5943946483aa9a5c9a130c0d1a35d3fd6))
* remove required from validated default to prevent NR short-circuit ([c7ab341](https://github.com/bonsaedev/nrg/commit/c7ab3417c0e7625fef54f77d25641c2287cdc66a))

## [0.18.4](https://github.com/bonsaedev/nrg/compare/v0.18.3...v0.18.4) (2026-06-08)


### Bug Fixes

* resolve node-red from local node_modules and fix Windows userDir path ([e584f2a](https://github.com/bonsaedev/nrg/commit/e584f2aee0a8c67df3d9688ddfe5ccb719bc86b0))

## [0.18.3](https://github.com/bonsaedev/nrg/compare/v0.18.2...v0.18.3) (2026-06-08)


### Bug Fixes

* resolve node-red binary directly to avoid Windows stdout buffering ([cbcf1b4](https://github.com/bonsaedev/nrg/commit/cbcf1b49bd1d11b4281b0e54fa9e79bc436d65af))

## [0.18.2](https://github.com/bonsaedev/nrg/compare/v0.18.1...v0.18.2) (2026-06-08)


### Bug Fixes

* add playwright and vitest-browser-vue as optional peer deps ([dcb43c4](https://github.com/bonsaedev/nrg/commit/dcb43c475368f2c64b8ed8fd3ade5ac8aa0d38ca))

## [0.18.1](https://github.com/bonsaedev/nrg/compare/v0.18.0...v0.18.1) (2026-06-08)


### Bug Fixes

* use standalone vitest configs to avoid self-referencing package specifier ([65f8854](https://github.com/bonsaedev/nrg/commit/65f885456b8633251da5b0292f410520173cae88))

# [0.18.0](https://github.com/bonsaedev/nrg/compare/v0.17.0...v0.18.0) (2026-06-08)


### Bug Fixes

* address review issues across client, vite, and test infrastructure ([78cd843](https://github.com/bonsaedev/nrg/commit/78cd843716d19e08ef0b90947d3c15ceb8a02893))
* use shallowRef to prevent Vue proxy from breaking editor and jQuery widgets ([19a3152](https://github.com/bonsaedev/nrg/commit/19a3152f294bc50c03d968706067585fce7f9a74))


### Features

* add client-side type inference and useFormNode composable ([b608225](https://github.com/bonsaedev/nrg/commit/b608225e425e695a688be0cd1349d7508c896532))
* add sent(portName) overload to test helper for typed named-port access ([44a668b](https://github.com/bonsaedev/nrg/commit/44a668b9d27c8c45acc3fe61d93bbd450796c873))

# [0.17.0](https://github.com/bonsaedev/nrg/compare/v0.16.0...v0.17.0) (2026-06-07)


### Bug Fixes

* add missing client unit test exports, CI job, and watch scripts ([c2b04f8](https://github.com/bonsaedev/nrg/commit/c2b04f85dbfdb4e2fb6da0f28e58940e67b87a62))
* deploy docs only after a release ([eeb966b](https://github.com/bonsaedev/nrg/commit/eeb966bb54de337fed358ffc20790c73805851d8))
* exclude test fixtures from root tsconfig ([f8f9082](https://github.com/bonsaedev/nrg/commit/f8f9082699581eb48041fc0fc2e420da8319c766))


### Features

* add client unit test helper library ([ff32aba](https://github.com/bonsaedev/nrg/commit/ff32aba665d565e6279e072b63ac7dc954f3288d))
* add Playwright E2E browser tests for form components ([f72ab27](https://github.com/bonsaedev/nrg/commit/f72ab277452db6fa142fef99201fae679491c1bf))

# [0.16.0](https://github.com/bonsaedev/nrg/compare/v0.15.1...v0.16.0) (2026-06-03)


### Bug Fixes

* export INode type from public API for consumer declaration generation ([df2bf33](https://github.com/bonsaedev/nrg/commit/df2bf33dd96f044d15a02320c169430a7d4c6755))
* prevent duplicate validator initialization across multiple nrg packages ([93f2ba3](https://github.com/bonsaedev/nrg/commit/93f2ba3d98b83752d3a7e93fff13c8437778db60))
* sendToPort autocomplete only offers named ports for record output schemas ([fb5911f](https://github.com/bonsaedev/nrg/commit/fb5911f7cf81f4ed3b8eb92f70575ecfcae4f727))


### Features

* expose editor instance and tray-footer slot in NodeRedEditorInput ([cf20d52](https://github.com/bonsaedev/nrg/commit/cf20d5285c211f2b64e1462d3e958bc9cc1b2d1b))

## [0.15.1](https://github.com/bonsaedev/nrg/compare/v0.15.0...v0.15.1) (2026-05-20)


### Bug Fixes

* attach test helpers before created() to capture lifecycle calls ([4ac6353](https://github.com/bonsaedev/nrg/commit/4ac63539f6eb1a6315ce44d1e68e40a9e426e1c1))
* use global symbol for WIRE_HANDLERS to fix cross-bundle resolution ([26a6cd0](https://github.com/bonsaedev/nrg/commit/26a6cd070f2b5cb33395afbc5d9fed646798d84e))

# [0.15.0](https://github.com/bonsaedev/nrg/compare/v0.14.0...v0.15.0) (2026-05-20)


### Features

* add named output ports and rename emit config keys ([3d69414](https://github.com/bonsaedev/nrg/commit/3d694145e61732b588a1d43181cbc6c2f26686a7))

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
