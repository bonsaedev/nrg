---
layout: home

hero:
  name: The Type-Safe
  text: Node-RED Framework
  tagline: Build fully typed nodes and plugins with TypeScript, Vue 3, JSON Schemas, and Vite.
  image:
    src: https://gist.githubusercontent.com/AllanOricil/84412df273de46b28c5d6945b391afd4/raw/c7e401ad279e1c19c6c8d30c9df0562907d39356/nrg-icon.svg
    alt: NRG
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/bonsaedev/nrg

features:
  - title: TypeScript-First
    details: Write nodes as typed classes. Input/output ports and wiring come from your TypeScript types, config is inferred from your schemas, and mistakes surface at compile time — not at 3am in production.
  - title: Batteries-Included Tooling
    details: Vite dev + build, Vitest with createNode and startRuntime helpers, and shared ESLint, Prettier, and TypeScript configs — all in the box. One install and your project builds, tests, types, lints, and formats. No toolchain to assemble.
  - title: Schema-Driven Editor Forms
    details: Define your config once with TypeBox and get a typed editor form for free — no HTML, no jQuery — plus matching validation on client and server. Need custom UI? Drop in Vue 3 components with built-in widgets.
---
