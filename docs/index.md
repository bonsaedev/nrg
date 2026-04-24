---
layout: home

hero:
  name: The Type-Safe
  text: Node-RED Framework
  tagline: Build fully typed nodes and plugins with TypeScript, Vue 3, JSON Schemas, and Vite.
  image:
    src: https://gist.githubusercontent.com/AllanOricil/84412df273de46b28c5d6945b391afd4/raw/0c9cdb994c40ab3d7b7ad06dcee162145d77d531/nrg-icon.svg
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
    details: Extend IONode, ConfigNode, or Node base classes with full type safety. Infer config types from schemas, get typed lifecycle hooks, and catch errors at compile time.
  - title: Schema-Driven
    details: Define config, credentials, input, and output schemas with TypeBox. The editor form is auto-generated from the schema — no client code required.
  - title: Auto-Generated Editor Forms
    details: Editor forms are generated from your schema automatically. Need more control? Override with Vue 3 components using built-in widgets for typed inputs, selects, code editors, and more.
  - title: Vite-Powered Build
    details: One plugin handles Vue SFC compilation, TypeScript transpilation, CJS/ESM output, and a live-reload dev server with Node-RED.
---
