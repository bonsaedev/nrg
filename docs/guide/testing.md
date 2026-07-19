# Testing

NRG nodes have two runtime surfaces — server-side logic (Node.js) and client-side UI (browser) — each with its own test strategies. NRG ships test libraries for all of them so you can verify your nodes end-to-end without running a manual Node-RED session. This page is the testing overview — the dependencies you install, the test types available, and when to reach for each. Each test type has its own dedicated page.

::: tip Scaffolded projects
If you created your project with `@bonsae/create-nrg`, the vitest configs, setup files, tsconfigs, dependencies, and folder structure described below are already in place. You can skip the setup sections and go straight to the API and examples.
:::

See also:

- [Server Testing](./testing-server) — server unit and integration tests
- [Client Unit Testing](./testing-client-unit) — pure client-plane TypeScript, no browser
- [Client Component & E2E Testing](./testing-client-e2e) — Vue editor components in a real browser, plus full editor round-trip

## Dependencies

NRG ships the test libraries themselves and bundles the Vue plugin integration (`@vitejs/plugin-vue`) it needs for component tests. The test runner and the DOM/browser tooling are peer dependencies you install for the test types you use:

| Package                      | Required for               | Why it's a peer dep                                                                           |
| ---------------------------- | -------------------------- | --------------------------------------------------------------------------------------------- |
| `vitest`                     | All tests                  | Test runner — your project controls the version and runs it via CLI                           |
| `happy-dom`                  | Client unit tests          | DOM environment for client unit tests (`environment: "happy-dom"`) — your project provides it |
| `@vitest/browser-playwright` | Component tests            | Playwright browser provider for Vitest — imported in vitest config files                      |
| `playwright`                 | Component tests, E2E tests | E2E test files import it directly (e.g., `import { chromium } from "playwright"`); component tests use it transitively via `@vitest/browser-playwright` |
| `vitest-browser-vue`         | Component tests            | Provides the `render` helper for mounting Vue components in browser tests                     |
| `@vitest/coverage-v8`        | Coverage (Node.js tests)   | Optional — only needed when running with `--coverage`                                         |
| `@vitest/coverage-istanbul`  | Coverage (browser tests)   | Optional — only needed when running with `--coverage`                                         |

```bash
# required
pnpm add -D vitest

# for client unit tests (DOM environment)
pnpm add -D happy-dom

# for server integration tests (a real in-process Node-RED runtime)
pnpm add -D node-red

# for component tests
pnpm add -D @vitest/browser-playwright playwright vitest-browser-vue

# optional: coverage providers
pnpm add -D @vitest/coverage-istanbul  # for browser-based tests (component, e2e)
pnpm add -D @vitest/coverage-v8        # for Node.js tests (server unit, server integration, client unit)
```

## Test Types

### Server

| Type            | What it tests                                                                                                                 | Speed                              | Library                               |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------- |
| **Unit**        | Node lifecycle, input/output routing, config, credentials, context stores, error handling                                     | Fast (Node.js, no browser)         | `@bonsae/nrg/test/server/unit`        |
| **Integration** | Deployed nodes in a real Node-RED runtime — flow wiring, NodeRef resolution, credentials, context, multi-node message passing | Medium (boots Node-RED in-process) | `@bonsae/nrg/test/server/integration` |

Server **unit** tests instantiate your node class with mocked Node-RED internals and exercise it in-process. `createNode` wires up the full lifecycle (`registered()`, `created()`, input handlers, close) so you test real behavior, not stubs.

Both server test tiers give your node the same ports it has in production. A node's base port topology — the input port and each named `Port<T>` output — comes from its `IONode` generics (`Input<Port<T>>` and the `Outputs<{ … }>` record), so the harness reads those types and wires those ports up for you. The built-in `error`/`complete`/`status` lifecycle ports are author-opt-in (the `errorPort`/`completePort`/`statusPort` config flags / Ports settings Enable toggles, off by default); the harness honors those flags, appending each enabled port after the base outputs — exactly as the built node does. (A config `inputSchema`/`outputSchemas` only validates the _data_ crossing a port; it never adds or removes ports.)

Server **integration** tests boot a real, headless Node-RED runtime, register your node classes through the same path production uses, deploy a flow, and drive it with real messages. Use them to verify the things mocks can't: that a config node resolves through a real `NodeRef`, that credentials reach a deployed node, that wired nodes pass messages, and that context stores persist across a flow.

### Client

| Type          | What it tests                                                                               | Speed                         | Library                             |
| ------------- | ------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------- |
| **Unit**      | Pure TypeScript logic used by client code (validation, utilities, helpers)                  | Fast (happy-dom)              | `@bonsae/nrg/test/client/unit`      |
| **Component** | Vue editor components — rendering, reactivity, user interactions, validation, RED API calls | Medium (headless browsers)    | `@bonsae/nrg/test/client/component` |
| **E2E**       | Full editor round-trip — form rendering, validation, TypedInput, config selectors, i18n     | Slow (real Node-RED instance) | `@bonsae/nrg/test/client/e2e`       |

Client **unit** tests cover standalone TypeScript modules (validation logic, format helpers, etc.) without rendering Vue components. They run in a happy-dom environment with mocked `RED` and `$` globals.

Client **component** tests render individual Vue components with Vitest browser mode and mocked Node-RED globals. The node and errors returned by `createNode()` are reactive — mutate them directly to drive conditional rendering, schema-driven validation, and RED API calls. Monaco editors and jQuery widget visuals stay mocked — that's what E2E is for.

Client **E2E** tests start a real Node-RED instance with your nodes installed and drive the editor with Playwright. They test the full stack — schema-driven form generation, validation messages, TypedInput widgets, config node selectors, and locale resolution.

### When to Use What

| I want to verify...                                                | Use                |
| ------------------------------------------------------------------ | ------------------ |
| Input handler transforms a message correctly                       | Server unit        |
| Node sets status after processing                                  | Server unit        |
| Config node credentials are resolved                               | Server unit        |
| TypedInput resolves msg/flow/global values                         | Server unit        |
| Wired nodes pass a message end to end through a flow               | Server integration |
| A real config node resolves and is used by a deployed node         | Server integration |
| Credentials reach a node deployed in a real runtime                | Server integration |
| A node reads or writes real flow/global context                    | Server integration |
| A validation utility rejects invalid input                         | Client unit        |
| A helper function formats data correctly                           | Client unit        |
| My Vue form renders the right fields                               | Client component   |
| A component emits `update:modelValue` on input                     | Client component   |
| Changing one field reveals or hides another                        | Client component   |
| Fixing an invalid value clears its validation error                | Client component   |
| A NodeRef field rejects ids of unregistered config nodes           | Client component   |
| `RED.editor.createEditor` is called on mount                       | Client component   |
| The editor form shows a validation error for empty required fields | Client E2E         |
| A TypedInput dropdown offers the correct types                     | Client E2E         |
| Config node selector shows registered config nodes                 | Client E2E         |
| Creating a config node from the node editor works end to end       | Client E2E         |
| Toggling a built-in port changes the node's ports on the canvas    | Client E2E         |
| Translations display correctly in the editor                       | Client E2E         |

`NodeDefinition` lifecycle hooks (`label()`, `paletteLabel()`, `outputLabels()`, `button.onClick`, `onEditResize`) need no special tooling — they are plain functions. Call them in a client unit test with a fake `this`:

```typescript
import { defineNode } from "@bonsae/nrg/client";

const def = defineNode({
  /* ... */
});
expect(def.label!.call({ name: "My Node" } as any)).toBe("My Node");
```
