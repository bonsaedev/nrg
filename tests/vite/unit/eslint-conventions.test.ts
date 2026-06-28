import { afterAll, describe, it } from "vitest";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import {
  nodeTypeMatchesFilename,
  schemaServerImportsTypeOnly,
} from "../../../src/eslint";

// Wire ESLint's RuleTester into vitest's runner so each valid/invalid case
// surfaces as its own assertion (the documented vitest integration). `afterAll`
// isn't in eslint's RuleTester static types, so assign through a loose handle.
const Tester = RuleTester as unknown as {
  afterAll: typeof afterAll;
  describe: typeof describe;
  it: typeof it;
};
Tester.afterAll = afterAll;
Tester.describe = describe;
Tester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    ecmaVersion: "latest",
    sourceType: "module",
  },
});

ruleTester.run("node-type-matches-filename", nodeTypeMatchesFilename as never, {
  valid: [
    // type matches the filename basename
    {
      filename: "src/server/nodes/my-node.ts",
      code: `export class MyNode { static type = "my-node"; }`,
    },
    // absolute path, still matches
    {
      filename: "/abs/pkg/src/server/nodes/job-dispatch.ts",
      code: `class JobDispatch { static type = "job-dispatch"; }`,
    },
    // not under server/nodes → rule is inert, any type is fine
    {
      filename: "src/server/index.ts",
      code: `class Whatever { static type = "anything-goes"; }`,
    },
    // non-static `type` field is not the node's type key → ignored
    {
      filename: "src/server/nodes/my-node.ts",
      code: `class MyNode { type = "not-the-static-one"; }`,
    },
  ],
  invalid: [
    {
      filename: "src/server/nodes/my-node.ts",
      code: `export class MyNode { static type = "wrong-type"; }`,
      errors: [{ messageId: "mismatch" }],
    },
    {
      filename: "/abs/pkg/src/server/nodes/job-dispatch.ts",
      code: `class JobDispatch { static type = "jobDispatch"; }`,
      errors: [{ messageId: "mismatch" }],
    },
  ],
});

ruleTester.run(
  "schema-server-imports-type-only",
  schemaServerImportsTypeOnly as never,
  {
    valid: [
      // schema imports a server node as a type-only default import
      {
        filename: "src/schemas/my-node.ts",
        code: `import type MyConfig from "../server/nodes/my-config";`,
      },
      // every specifier is an inline `type` import
      {
        filename: "src/schemas/my-node.ts",
        code: `import { type MyConfig } from "../server/nodes/my-config";`,
      },
      // the toolkit is a bare specifier (not the consumer's server dir) — allowed as a value
      {
        filename: "src/schemas/my-node.ts",
        code: `import { defineSchema, SchemaType } from "@bonsae/nrg/server";`,
      },
      // a relative non-server module may be value-imported
      {
        filename: "src/schemas/my-node.ts",
        code: `import { DEFAULTS } from "../shared/templates";`,
      },
      // type-only re-export of a server module
      {
        filename: "src/schemas/my-node.ts",
        code: `export type { MyConfig } from "../server/nodes/my-config";`,
      },
      // re-export whose every specifier is an inline `type`
      {
        filename: "src/schemas/my-node.ts",
        code: `export { type MyConfig } from "../server/nodes/my-config";`,
      },
      // a local export (no source) is never a runtime edge
      {
        filename: "src/schemas/my-node.ts",
        code: `const Local = 1; export { Local };`,
      },
      // re-export-all of a non-server module is fine
      {
        filename: "src/schemas/my-node.ts",
        code: `export * from "../shared/templates";`,
      },
      // outside schemas the rule is inert: a server node may value-import a schema
      {
        filename: "src/server/nodes/my-node.ts",
        code: `import { ConfigsSchema } from "../../schemas/my-node";`,
      },
      // outside schemas the rule is inert even for a server value-import
      {
        filename: "src/server/nodes/my-node.ts",
        code: `import Other from "../server/nodes/other";`,
      },
    ],
    invalid: [
      // default value-import of a server module from a schema
      {
        filename: "src/schemas/my-node.ts",
        code: `import MyConfig from "../server/nodes/my-config";`,
        errors: [{ messageId: "valueImport" }],
      },
      // named value-import of a server module from a schema
      {
        filename: "src/schemas/my-node.ts",
        code: `import { MyConfig } from "../server/nodes/my-config";`,
        errors: [{ messageId: "valueImport" }],
      },
      // absolute filename, deeper relative server path
      {
        filename: "/abs/pkg/src/schemas/my-node.ts",
        code: `import { Foo } from "../../server/lib/foo";`,
        errors: [{ messageId: "valueImport" }],
      },
      // value re-export of a server module
      {
        filename: "src/schemas/my-node.ts",
        code: `export { MyConfig } from "../server/nodes/my-config";`,
        errors: [{ messageId: "valueImport" }],
      },
      // re-export-all of a server module
      {
        filename: "src/schemas/my-node.ts",
        code: `export * from "../server/nodes/my-config";`,
        errors: [{ messageId: "valueImport" }],
      },
    ],
  },
);
