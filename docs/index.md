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
  - title: No More jQuery
    details: Replace raw HTML templates and jQuery event handlers with auto-generated forms from JSON Schemas — or write Vue 3 components when you need custom UI.
  - title: TypeScript-First
    details: Extend IONode or ConfigNode with full type safety. Config types are inferred from your schemas, lifecycle hooks are typed, and errors surface at compile time.
  - title: Async by Default
    details: "No callback chains. Write async input(msg) and call this.send() — done() is handled for you. Resolve TypedInputs with await this.config.target.resolve(msg)."
  - title: Schema-Driven Validation
    details: Define a schema once with TypeBox and get inline form errors, the red error triangle on the workspace, server-side validation, and TypeScript types — all from one source.
  - title: Auto-Generated Editor Forms
    details: Editor forms come straight from your schema. Need more control? Override them with Vue 3 components, using built-in widgets for typed inputs, selects, code editors, and more.
  - title: Vite-Powered Build
    details: "One command: pnpm vite dev. Vite watches your files, rebuilds server and client on the fly, and proxies to a live Node-RED instance — no more restart-refresh-redeploy loops."
---
