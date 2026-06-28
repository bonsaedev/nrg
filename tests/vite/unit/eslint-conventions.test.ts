import { afterAll, describe, it } from "vitest";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { nodeTypeMatchesFilename } from "../../../src/eslint";

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
