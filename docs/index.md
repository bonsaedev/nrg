---
layout: home

hero:
  name: The Type-Safe
  text: Node-RED Framework
  tagline: Build fully typed Node-RED nodes with TypeScript, Vue 3, JSON Schemas, and Vite.
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
    details: Write nodes as typed classes. Your TypeScript types decide the input/output ports and which nodes can connect, your schema shapes the config — so wrong wiring or a bad setting is a red squiggle in your editor, not a 3am production page.
  - title: Batteries-Included Tooling
    details: Vite dev + build, Vitest with helpers to mount a single node or spin up a real Node-RED runtime, and shared ESLint, Prettier, and TypeScript configs — all in the box. Scaffold a project and it already builds, tests, types, lints, and formats — the whole toolchain is wired up for you, nothing to assemble.
  - title: Schema-Driven Editor Forms
    details: Define your config once with TypeBox and get a ready-made editor form — no hand-written form markup — with the same validation running in the editor and on the server. Need custom UI? Drop in Vue 3 components using NRG's built-in form widgets.
---
