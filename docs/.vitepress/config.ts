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
        href: "https://gist.githubusercontent.com/AllanOricil/84412df273de46b28c5d6945b391afd4/raw/0c9cdb994c40ab3d7b7ad06dcee162145d77d531/nrg-icon.svg",
      },
    ],
  ],
  themeConfig: {
    logo: "https://gist.githubusercontent.com/AllanOricil/84412df273de46b28c5d6945b391afd4/raw/0c9cdb994c40ab3d7b7ad06dcee162145d77d531/nrg-icon.svg",
    nav: [
      { text: "Guide", link: "/guide/getting-started" },
      {
        text: "npm",
        link: "https://www.npmjs.com/package/@bonsae/nrg",
      },
    ],
    sidebar: [
      {
        text: "Guide",
        items: [
          { text: "Why NRG?", link: "/guide/why-nrg" },
          { text: "Getting Started", link: "/guide/getting-started" },
          { text: "Project Structure", link: "/guide/project-structure" },
          { text: "Creating a Node", link: "/guide/creating-a-node" },
          {
            text: "Building & Running",
            link: "/guide/building-and-running",
          },
          { text: "Schema Validation", link: "/guide/schemas" },
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
