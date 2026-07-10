import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  extractUnsafeTypesFromSource,
  extractUnsafeTypes,
} from "@/tools/vite/client/plugins/unsafe-types";

const IMPORT = `import { defineSchema, SchemaType } from "@bonsae/nrg/schema";`;

describe("unsafe-types parser", () => {
  describe("extractUnsafeTypesFromSource", () => {
    it("recovers the T text for Unsafe<T>() — interface, fn, and generic types", () => {
      const code = `${IMPORT}
        const S = defineSchema({
          conn: SchemaType.Unsafe<Connection>(),
          handler: SchemaType.Unsafe<(msg: Msg) => void>(),
          ids: SchemaType.Unsafe<Map<string, number>>(),
          name: SchemaType.String(),
        }, { $id: "n:out" });`;
      expect(extractUnsafeTypesFromSource("n.ts", code).get("n:out")).toEqual({
        conn: "Connection",
        handler: "(msg: Msg) => void",
        ids: "Map<string, number>",
      });
    });

    it("recovers the T for NodeRef<T>() and TypedInput<T>() too", () => {
      const code = `${IMPORT}
        const S = defineSchema({
          connection: SchemaType.NodeRef<SalesforceConnection>("salesforce-connection"),
          query: SchemaType.TypedInput<string>({ default: { type: "str", value: "" } }),
        }, { $id: "soql:config" });`;
      expect(
        extractUnsafeTypesFromSource("n.ts", code).get("soql:config"),
      ).toEqual({
        connection: "SalesforceConnection",
        query: "string",
      });
    });

    it("handles Array(Unsafe<T>()) as T[]", () => {
      const code = `${IMPORT}
        const S = defineSchema({ rows: SchemaType.Array(SchemaType.Unsafe<Row>()) }, { $id: "n:rows" });`;
      expect(extractUnsafeTypesFromSource("n.ts", code).get("n:rows")).toEqual({
        rows: "Row[]",
      });
    });

    it("matches a schema defined as a separate const, not only inline", () => {
      const code = `${IMPORT}
        export const OutputSchema = defineSchema({ conn: SchemaType.Unsafe<Pool>() }, { $id: "db:out" });`;
      expect(extractUnsafeTypesFromSource("n.ts", code).get("db:out")).toEqual({
        conn: "Pool",
      });
    });

    it("resolves aliased imports rather than guessing by name", () => {
      const code = `import { defineSchema as ds, SchemaType as ST } from "@bonsae/nrg/schema";
        const S = ds({ conn: ST.Unsafe<Connection>() }, { $id: "n:alias" });`;
      expect(extractUnsafeTypesFromSource("n.ts", code).get("n:alias")).toEqual(
        {
          conn: "Connection",
        },
      );
    });

    it("does NOT match an unrelated .Unsafe (no false positives)", () => {
      const code = `${IMPORT}
        const S = defineSchema({ x: Foo.Unsafe<Bar>(), y: SchemaType.Unsafe<Real>() }, { $id: "n:fp" });`;
      expect(extractUnsafeTypesFromSource("n.ts", code).get("n:fp")).toEqual({
        y: "Real",
      });
    });

    it("contributes nothing when nrg is not imported", () => {
      const code = `const SchemaType: any = {}; const defineSchema: any = () => ({});
        const S = defineSchema({ x: SchemaType.Unsafe<Bar>() }, { $id: "n:noimport" });`;
      expect(extractUnsafeTypesFromSource("n.ts", code).size).toBe(0);
    });

    it("handles string-literal property keys", () => {
      const code = `${IMPORT}
        const S = defineSchema({ "the-conn": SchemaType.Unsafe<Conn>() }, { $id: "n:strkey" });`;
      expect(
        extractUnsafeTypesFromSource("n.ts", code).get("n:strkey"),
      ).toEqual({
        "the-conn": "Conn",
      });
    });

    it("skips schemas with a missing or non-literal $id", () => {
      const code = `${IMPORT}
        const A = defineSchema({ x: SchemaType.Unsafe<X>() }, {});
        const B = defineSchema({ y: SchemaType.Unsafe<Y>() }, { $id: \`\${prefix}:z\` });`;
      expect(extractUnsafeTypesFromSource("n.ts", code).size).toBe(0);
    });

    it("does not record schemas with no unsafe properties", () => {
      const code = `${IMPORT}
        const S = defineSchema({ name: SchemaType.String() }, { $id: "n:plain" });`;
      expect(extractUnsafeTypesFromSource("n.ts", code).size).toBe(0);
    });

    it("normalizes whitespace in multi-line type arguments", () => {
      const code = `${IMPORT}
        const S = defineSchema({ cb: SchemaType.Unsafe<{
            a: number;
            b: string;
          }>() }, { $id: "n:ws" });`;
      expect(extractUnsafeTypesFromSource("n.ts", code).get("n:ws")).toEqual({
        cb: "{ a: number; b: string; }",
      });
    });

    it("throws on a duplicate $id within a file", () => {
      const code = `${IMPORT}
        const A = defineSchema({ x: SchemaType.Unsafe<X>() }, { $id: "dup" });
        const B = defineSchema({ y: SchemaType.Unsafe<Y>() }, { $id: "dup" });`;
      expect(() => extractUnsafeTypesFromSource("n.ts", code)).toThrow(
        /Duplicate schema \$id "dup"/,
      );
    });

    it("is deterministic — identical input yields identical output", () => {
      const code = `${IMPORT}
        const S = defineSchema({ a: SchemaType.Unsafe<A>(), b: SchemaType.Unsafe<B>() }, { $id: "n:det" });`;
      expect([...extractUnsafeTypesFromSource("n.ts", code)]).toEqual([
        ...extractUnsafeTypesFromSource("n.ts", code),
      ]);
    });
  });

  describe("extractUnsafeTypes (directory scan)", () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-unsafe-"));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it("merges schemas across files and ignores .d.ts / .test.ts", () => {
      fs.writeFileSync(
        path.join(dir, "a.ts"),
        `${IMPORT}\nconst S = defineSchema({ conn: SchemaType.Unsafe<Conn>() }, { $id: "a:out" });`,
      );
      fs.mkdirSync(path.join(dir, "sub"));
      fs.writeFileSync(
        path.join(dir, "sub", "b.ts"),
        `${IMPORT}\nconst S = defineSchema({ h: SchemaType.Unsafe<H>() }, { $id: "b:out" });`,
      );
      fs.writeFileSync(
        path.join(dir, "c.d.ts"),
        `${IMPORT}\nconst S = defineSchema({ x: SchemaType.Unsafe<X>() }, { $id: "c:out" });`,
      );
      fs.writeFileSync(
        path.join(dir, "d.test.ts"),
        `${IMPORT}\nconst S = defineSchema({ x: SchemaType.Unsafe<X>() }, { $id: "d:out" });`,
      );

      const map = extractUnsafeTypes(dir);
      expect(map.get("a:out")).toEqual({ conn: "Conn" });
      expect(map.get("b:out")).toEqual({ h: "H" });
      expect(map.has("c:out")).toBe(false);
      expect(map.has("d:out")).toBe(false);
    });

    it("throws on a duplicate $id across files", () => {
      fs.writeFileSync(
        path.join(dir, "a.ts"),
        `${IMPORT}\nconst S = defineSchema({ x: SchemaType.Unsafe<X>() }, { $id: "dup" });`,
      );
      fs.writeFileSync(
        path.join(dir, "b.ts"),
        `${IMPORT}\nconst S = defineSchema({ y: SchemaType.Unsafe<Y>() }, { $id: "dup" });`,
      );
      expect(() => extractUnsafeTypes(dir)).toThrow(
        /Duplicate schema \$id "dup"/,
      );
    });

    it("returns an empty map for a missing directory", () => {
      expect(extractUnsafeTypes(path.join(dir, "nope")).size).toBe(0);
    });
  });
});
