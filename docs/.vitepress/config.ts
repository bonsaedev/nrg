import { defineConfig } from "vitepress";

export default defineConfig({
  title: "NRG",
  description:
    "Build Node-RED nodes with Vue 3, TypeScript, and JSON Schema validation",
  base: "/nrg/",
  appearance: "force-dark",
  ignoreDeadLinks: [/localhost/],
  head: [
    [
      "link",
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "https://gist.githubusercontent.com/AllanOricil/84412df273de46b28c5d6945b391afd4/raw/c7e401ad279e1c19c6c8d30c9df0562907d39356/nrg-icon.svg",
      },
    ],
  ],
  themeConfig: {
    logo: "https://gist.githubusercontent.com/AllanOricil/84412df273de46b28c5d6945b391afd4/raw/c7e401ad279e1c19c6c8d30c9df0562907d39356/nrg-icon.svg",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      {
        text: "npm",
        link: "https://www.npmjs.com/package/@bonsae/nrg",
      },
    ],
    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "Why NRG?", link: "/guide/why-nrg" },
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Project Structure", link: "/guide/project-structure" },
        ],
      },
      {
        text: "Core Concepts",
        items: [
          { text: "The Message Model", link: "/guide/message-model" },
          { text: "Message Channels", link: "/guide/message-channels" },
        ],
      },
      {
        text: "Authoring a Node",
        items: [
          { text: "The Node Class", link: "/guide/creating-a-node" },
          { text: "Form Fields", link: "/guide/form-fields" },
          { text: "Schema Validation", link: "/guide/schemas" },
          { text: "The Editor Form", link: "/guide/editor-form" },
          {
            text: "Config Nodes & Extending",
            link: "/guide/config-nodes",
          },
          {
            text: "Locales & Help Docs",
            link: "/guide/locales",
          },
        ],
      },
      {
        text: "Build & Test",
        items: [
          {
            text: "Building & Running",
            link: "/guide/building-and-running",
          },
          { text: "Testing Overview", link: "/guide/testing" },
          { text: "Server Testing", link: "/guide/testing-server" },
          {
            text: "Client Unit Testing",
            link: "/guide/testing-client-unit",
          },
          {
            text: "Client Component & E2E",
            link: "/guide/testing-client-e2e",
          },
        ],
      },
      {
        text: "Advanced",
        items: [
          {
            text: "Conditional Validation",
            link: "/guide/conditional-validation",
          },
          { text: "Non-Data Ports", link: "/guide/non-data-ports" },
        ],
      },
    ],
    socialLinks: [
      { icon: "github", link: "https://github.com/bonsaedev/nrg" },
    ],
    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright 2024-present Bonsae",
    },
    search: {
      provider: "local",
    },
  },
});
