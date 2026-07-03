import { describe, it, expect } from "vitest";
import { Linter } from "eslint";
import { nrg } from "../../../src/tools/eslint";

// These tests exercise the ASSEMBLED `nrg` flat-config array end to
// end through ESLint's Linter — not the custom rules in isolation (that's
// eslint-conventions.test.ts). They prove two things a consumer relies on:
//   1. `export default nrg` enforces the recommended rules, the NRG
//      node conventions, and the plane-import boundary out of the box.
//   2. Because it's a flat-config ARRAY (last block wins), a consumer can
//      override ANY default by appending their own block after `...nrg`.

/** Lint `code` as `filename`, optionally appending consumer override blocks. */
function lint(
  code: string,
  filename: string,
  overrides: unknown[] = [],
): Linter.LintMessage[] {
  const linter = new Linter({ configType: "flat" });
  // Mirrors a consumer's `export default [...nrg, ...overrides]`.
  const config = [...nrg, ...overrides] as Parameters<typeof linter.verify>[1];
  return linter.verify(code, config, { filename });
}

const ruleIds = (messages: Linter.LintMessage[]) =>
  messages.map((m) => m.ruleId);

describe("nrg is a complete drop-in flat config", () => {
  it("is a non-empty flat-config array (spreadable into a consumer config)", () => {
    expect(Array.isArray(nrg)).toBe(true);
    expect(nrg.length).toBeGreaterThan(0);
  });

  it("enforces the NRG node-type-matches-filename rule by default", () => {
    const messages = lint(
      `export class MyNode { static type = "wrong-type"; }`,
      "src/server/nodes/my-node.ts",
    );
    expect(ruleIds(messages)).toContain(
      "@bonsae/nrg/node-type-matches-filename",
    );
  });

  it("enforces recommended JS rules by default", () => {
    const messages = lint(`const unused = 1;`, "src/server/nodes/my-node.ts");
    expect(ruleIds(messages)).toContain("@typescript-eslint/no-unused-vars");
  });

  it("leaves no-explicit-any OFF by default (an NRG relaxation)", () => {
    const messages = lint(
      `export const f = (x: any) => x;`,
      "src/server/nodes/my-node.ts",
    );
    expect(ruleIds(messages)).not.toContain(
      "@typescript-eslint/no-explicit-any",
    );
  });

  it("enforces the client→server import boundary by default", () => {
    const messages = lint(
      `import { IONode } from "@bonsae/nrg/server";`,
      "src/client/form.ts",
    );
    expect(ruleIds(messages)).toContain(
      "@typescript-eslint/no-restricted-imports",
    );
  });

  it("allows a type-only cross-plane import (boundary is value-only)", () => {
    const messages = lint(
      `import type { IONode } from "@bonsae/nrg/server";`,
      "src/client/form.ts",
    );
    expect(ruleIds(messages)).not.toContain(
      "@typescript-eslint/no-restricted-imports",
    );
  });
});

describe("a consumer can override whatever they want", () => {
  it("can DISABLE an NRG custom rule by appending a block", () => {
    const code = `export class MyNode { static type = "wrong-type"; }`;
    const filename = "src/server/nodes/my-node.ts";

    // Baseline: the default config flags it.
    expect(ruleIds(lint(code, filename))).toContain(
      "@bonsae/nrg/node-type-matches-filename",
    );

    // Override: the appended block turns it off, and the override wins.
    const overridden = lint(code, filename, [
      { rules: { "@bonsae/nrg/node-type-matches-filename": "off" } },
    ]);
    expect(ruleIds(overridden)).not.toContain(
      "@bonsae/nrg/node-type-matches-filename",
    );
  });

  it("can TURN ON a rule NRG relaxed (no-explicit-any → error)", () => {
    const code = `export const f = (x: any) => x;`;
    const filename = "src/server/nodes/my-node.ts";

    // Baseline: off, so no message.
    expect(ruleIds(lint(code, filename))).not.toContain(
      "@typescript-eslint/no-explicit-any",
    );

    // Override: a consumer re-enables it and it now fires as an error.
    const overridden = lint(code, filename, [
      {
        files: ["src/**/*.{ts,vue}"],
        rules: { "@typescript-eslint/no-explicit-any": "error" },
      },
    ]);
    const hit = overridden.find(
      (m) => m.ruleId === "@typescript-eslint/no-explicit-any",
    );
    expect(hit).toBeDefined();
    expect(hit?.severity).toBe(2);
  });

  it("can RELAX the client→server import boundary", () => {
    const code = `import { IONode } from "@bonsae/nrg/server";`;
    const filename = "src/client/form.ts";

    // Baseline: boundary flags the value-import.
    expect(ruleIds(lint(code, filename))).toContain(
      "@typescript-eslint/no-restricted-imports",
    );

    // Override: a consumer opts out of the boundary for client files.
    const overridden = lint(code, filename, [
      {
        files: ["src/client/**/*.ts"],
        rules: { "@typescript-eslint/no-restricted-imports": "off" },
      },
    ]);
    expect(ruleIds(overridden)).not.toContain(
      "@typescript-eslint/no-restricted-imports",
    );
  });

  it("can CHANGE a rule's options (consistent-type-imports → off)", () => {
    const filename = "src/server/nodes/my-node.ts";
    const overridden = lint(`export const f = (x: any) => x;`, filename, [
      { rules: { "@typescript-eslint/consistent-type-imports": "off" } },
    ]);
    // The override is accepted and produces no consistent-type-imports message.
    expect(ruleIds(overridden)).not.toContain(
      "@typescript-eslint/consistent-type-imports",
    );
  });
});
