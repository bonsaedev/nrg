import { describe, it, expect, vi } from "vitest";
import { IONode } from "@/sdk/lib/server/nodes/io-node";
import { initValidator } from "@/sdk/lib/server/validation";
import { defineSchema, SchemaType } from "@/sdk/lib/shared/schemas";
import { createRED, createNodeRedNode } from "@mocks/red";
import {
  NRG_SETUP_CLOSE_HANDLER,
  NRG_SETUP_INPUT_HANDLER,
} from "@/sdk/lib/server/nodes/symbols";

class TestIONode extends IONode {
  static override readonly type = "test-io-node";
  static override readonly category = "function";
  static override readonly color = "#ffffff" as const;
  static override readonly inputSchema = SchemaType.Object({});
  static override readonly outputsSchema = SchemaType.Object({});

  public inputCalled = false;
  public lastMsg: any = null;

  public override async input(msg: any) {
    this.inputCalled = true;
    this.lastMsg = msg;
  }
}

describe("IONode", () => {
  describe("constructor", () => {
    it("should set up context with node, flow, and global", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      const ctx = (instance as any).context;
      expect(ctx).toBeDefined();
      expect(ctx.node).toBeDefined();
      expect(ctx.flow).toBeDefined();
      expect(ctx.global).toBeDefined();
    });

    it("should support context as a function with scope", async () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      const nodeCtx = (instance as any).context("node");
      expect(nodeCtx).toBeDefined();
      expect(nodeCtx.get).toBeDefined();
      expect(nodeCtx.set).toBeDefined();
      expect(nodeCtx.keys).toBeDefined();
    });
  });

  describe("properties", () => {
    it("should expose x, y, g, wires from underlying node", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      expect(instance.x).toBe(100);
      expect(instance.y).toBe(200);
      expect(instance.g).toBe("group-1");
      expect(instance.wires).toEqual([["node-2"]]);
    });
  });

  describe("outputPortNames (static)", () => {
    it("returns the keys for a named-ports record schema", () => {
      class Named extends IONode {
        static override readonly type = "named-out";
        static override readonly outputsSchema = {
          success: SchemaType.Object({}),
          failure: SchemaType.Object({}),
        };
      }
      expect(Named.outputPortNames).toEqual(["success", "failure"]);
    });

    it("is undefined for a single schema (Object/Any/Union)", () => {
      class SingleObj extends IONode {
        static override readonly type = "single-obj";
        static override readonly outputsSchema = SchemaType.Object({});
      }
      class SingleAny extends IONode {
        static override readonly type = "single-any";
        static override readonly outputsSchema = SchemaType.Any({
          $id: "single-any:out",
        });
      }
      expect(SingleObj.outputPortNames).toBeUndefined();
      expect(SingleAny.outputPortNames).toBeUndefined();
    });

    it("is undefined for positional arrays and no schema", () => {
      class Positional extends IONode {
        static override readonly type = "positional-out";
        static override readonly outputsSchema = [
          SchemaType.Any(),
          SchemaType.Any(),
        ];
      }
      class NoOut extends IONode {
        static override readonly type = "no-out";
      }
      expect(Positional.outputPortNames).toBeUndefined();
      expect(NoOut.outputPortNames).toBeUndefined();
    });

    it("prefers build-injected __nrgPorts topology over the schema", () => {
      // Topology comes from the Output generic (build-injected). When present it
      // is the source of truth — even over a schema, which is validation-only
      // and must NOT drive port count/names.
      class Generic extends IONode {
        static override readonly type = "generic-ports";
        static override readonly outputsSchema = SchemaType.Object({});
        static override __nrgPorts: NonNullable<typeof IONode.__nrgPorts> = {
          inputs: 1,
          outputs: 2,
          outputNames: ["ok", "failed"],
        };
      }
      expect(Generic.outputs).toBe(2); // not 1 (the single-object schema)
      expect(Generic.inputs).toBe(1);
      expect(Generic.outputPortNames).toEqual(["ok", "failed"]);
    });
  });

  describe("input handling", () => {
    it("should call input method with message", async () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      // Wire up event handlers
      const createdPromise = Promise.resolve();
      instance[NRG_SETUP_CLOSE_HANDLER]();
      instance[NRG_SETUP_INPUT_HANDLER](createdPromise);

      const send = vi.fn();
      const done = vi.fn();
      await node.emit("input", { payload: "test" }, send, done);

      expect(instance.inputCalled).toBe(true);
      expect(instance.lastMsg).toEqual({ payload: "test" });
    });

    it("should validate input when validateInput is true and inputSchema exists", async () => {
      const inputSchema = defineSchema(
        { payload: SchemaType.String({ minLength: 1 }) },
        { $id: "io-input-validation-test" },
      );

      class ValidatedIONode extends IONode {
        static override readonly type = "validated-io";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateInput = true;
        static override readonly inputSchema = inputSchema;
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ValidatedIONode(RED, node, {}, {});

      const createdPromise = Promise.resolve();
      instance[NRG_SETUP_CLOSE_HANDLER]();
      instance[NRG_SETUP_INPUT_HANDLER](createdPromise);

      const send = vi.fn();
      const done = vi.fn();
      await node.emit("input", { payload: "" }, send, done);

      // done should have been called with an error
      expect(done).toHaveBeenCalled();
      expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it("should not validate input when validateInput is false", async () => {
      const inputSchema = defineSchema(
        { payload: SchemaType.String({ minLength: 1 }) },
        { $id: "io-no-input-validation-test" },
      );

      class NoValidateIONode extends IONode {
        static override readonly type = "no-validate-io";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateInput = false;
        static override readonly inputSchema = inputSchema;
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new NoValidateIONode(RED, node, {}, {});

      const createdPromise = Promise.resolve();
      instance[NRG_SETUP_CLOSE_HANDLER]();
      instance[NRG_SETUP_INPUT_HANDLER](createdPromise);

      const send = vi.fn();
      const done = vi.fn();
      await node.emit("input", { payload: "" }, send, done);

      // done should have been called without error
      expect(done).toHaveBeenCalledWith();
    });

    it("validates input against the flow-author config.inputSchema override", async () => {
      // No static inputSchema — the flow-author's JSON override supplies it, and
      // overwrites the author's (here absent) schema at validation time.
      class OverrideInputNode extends IONode {
        static override readonly type = "cfg-input-schema";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        public override async input() {}
      }
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new OverrideInputNode(
        RED,
        node,
        {
          validateInput: true,
          inputSchema: JSON.stringify({
            type: "object",
            properties: { payload: { type: "string", minLength: 1 } },
            required: ["payload"],
          }),
        },
        {},
      );
      instance[NRG_SETUP_CLOSE_HANDLER]();
      instance[NRG_SETUP_INPUT_HANDLER](Promise.resolve());

      const send = vi.fn();
      const done = vi.fn();
      await node.emit("input", { payload: "" }, send, done);
      expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it("falls back to the static schema (warning once) on an unusable override", async () => {
      // Valid JSON, but the $ref can't be resolved → it does not COMPILE. The
      // node must NOT throw on every message: it warns once and validates
      // against its static schema instead.
      const staticInput = defineSchema(
        { payload: SchemaType.String({ minLength: 1 }) },
        { $id: "io-bad-override-fallback" },
      );
      class BadOverrideNode extends IONode {
        static override readonly type = "bad-override";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateInput = true;
        static override readonly inputSchema = staticInput;
        public override async input() {}
      }
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const warnSpy = vi.spyOn(node, "warn");
      const instance = new BadOverrideNode(
        RED,
        node,
        {
          validateInput: true,
          inputSchema: JSON.stringify({ $ref: "#/$defs/missing" }),
        },
        {},
      );
      instance[NRG_SETUP_CLOSE_HANDLER]();
      instance[NRG_SETUP_INPUT_HANDLER](Promise.resolve());

      const send = vi.fn();
      const done = vi.fn();
      // Two invalid messages: each rejects against the STATIC schema (the
      // fallback), and the bad-override warning fires exactly once (memoized),
      // not per message.
      await node.emit("input", { payload: "" }, send, done);
      await node.emit("input", { payload: "" }, send, done);
      expect(done.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(done.mock.calls[1][0]).toBeInstanceOf(Error);
      const overrideWarnings = warnSpy.mock.calls.filter((c) =>
        String(c[0]).includes("invalid schema override"),
      );
      expect(overrideWarnings).toHaveLength(1);
    });
  });

  describe("send", () => {
    it("should use send callback when inside input handler", async () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();

      class SendingNode extends IONode {
        static override readonly type = "sending-node";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        public override async input() {
          this.send("result");
        }
      }

      const instance = new SendingNode(RED, node, {}, {});
      const createdPromise = Promise.resolve();
      instance[NRG_SETUP_CLOSE_HANDLER]();
      instance[NRG_SETUP_INPUT_HANDLER](createdPromise);

      const send = vi.fn();
      const done = vi.fn();
      await node.emit("input", {}, send, done);

      // every send wraps under the return key (default "output"); carry (the
      // default mode) keeps incoming context without recording lineage. The
      // value is delivered as a positional array (one slot per port).
      expect(send).toHaveBeenCalledWith([{ output: "result" }]);
    });

    it("should fall back to node.send outside input handler", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.send("test");
      expect(node.send).toHaveBeenCalledWith([{ output: "test" }]);
    });

    it("should validate per-port with array of schemas", () => {
      const schema1 = defineSchema(
        { result: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-port1-test" },
      );
      const schema2 = defineSchema(
        { error: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-port2-test" },
      );

      class MultiOutputNode extends IONode {
        static override readonly type = "multi-output";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateOutput = true;
        static override readonly outputsSchema = [schema1, schema2];
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new MultiOutputNode(RED, node, {}, {});

      // Valid: first port has data, second is null
      expect(() => instance.send([{ result: "ok" }, null])).not.toThrow();

      // Invalid: first port has empty result
      expect(() => instance.send([{ result: "" }, null])).toThrow();
    });

    it("validates output against the flow-author config.outputSchemas override", () => {
      // The static schema accepts anything; the config override is strict and
      // overwrites it, so an invalid value throws and a valid one passes.
      class OverrideOutputNode extends IONode {
        static override readonly type = "cfg-output-schema";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly outputsSchema = [SchemaType.Any()];
      }
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new OverrideOutputNode(
        RED,
        node,
        {
          validateOutputs: { 0: true },
          outputSchemas: {
            0: JSON.stringify({
              type: "object",
              properties: { n: { type: "number" } },
              required: ["n"],
            }),
          },
        },
        {},
      );
      // single output port → the raw value is the port-0 value.
      expect(() => instance.send({ n: 1 })).not.toThrow();
      expect(() => instance.send({ wrong: "x" })).toThrow();
    });

    it("honors a per-port boolean[] validateOutput default", () => {
      const schema1 = defineSchema(
        { result: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-perport1-test" },
      );
      const schema2 = defineSchema(
        { error: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-perport2-test" },
      );

      class PerPortValidateNode extends IONode {
        static override readonly type = "per-port-validate";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        // port 0 unchecked, port 1 validated
        static override readonly validateOutput = [false, true];
        static override readonly outputsSchema = [schema1, schema2];
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new PerPortValidateNode(RED, node, {}, {});

      // Port 0 default is false: an invalid value passes through unvalidated.
      expect(() => instance.send([{ result: "" }, null])).not.toThrow();
      // Port 1 default is true: an invalid value throws.
      expect(() => instance.send([null, { error: "" }])).toThrow();
      // Port 1 valid passes.
      expect(() => instance.send([null, { error: "boom" }])).not.toThrow();
    });

    it("defaults ports beyond the boolean[] length to no validation", () => {
      const schema1 = defineSchema(
        { result: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-perport-short1-test" },
      );
      const schema2 = defineSchema(
        { error: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-perport-short2-test" },
      );

      class ShortFlagsNode extends IONode {
        static override readonly type = "short-flags-validate";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        // only port 0 declared; port 1 has no entry -> defaults to false
        static override readonly validateOutput = [true];
        static override readonly outputsSchema = [schema1, schema2];
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ShortFlagsNode(RED, node, {}, {});

      // Port 0 is validated.
      expect(() => instance.send([{ result: "" }, null])).toThrow();
      // Port 1 has no flag entry -> not validated.
      expect(() => instance.send([null, { error: "" }])).not.toThrow();
    });

    it("lets the per-instance config override the static boolean[] default", () => {
      const schema1 = defineSchema(
        { result: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-override1-test" },
      );
      const schema2 = defineSchema(
        { error: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-override2-test" },
      );

      class OverrideNode extends IONode {
        static override readonly type = "override-validate";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        // both ports validated by default
        static override readonly validateOutput = [true, true];
        static override readonly outputsSchema = [schema1, schema2];
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      // Flow author turns port 0 off; port 1 keeps the static default.
      const instance = new OverrideNode(
        RED,
        node,
        { validateOutputs: { 0: false } },
        {},
      );

      // Port 0 overridden off: invalid value passes.
      expect(() => instance.send([{ result: "" }, null])).not.toThrow();
      // Port 1 still on: invalid value throws.
      expect(() => instance.send([null, { error: "" }])).toThrow();
    });

    it("validates an array sent from a single-output node as the value", () => {
      // A single-output node treats an array argument as the value (not as
      // per-port messages), so the schema describes the array itself.
      const outputSchema = SchemaType.Array(
        SchemaType.String({ minLength: 1 }),
        { $id: "io-output-single-array-test" },
      );

      class SingleSchemaArrayNode extends IONode {
        static override readonly type = "single-schema-array";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateOutput = true;
        static override readonly outputsSchema = outputSchema;
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new SingleSchemaArrayNode(RED, node, {}, {});

      // Valid: the array value matches the array schema
      expect(() => instance.send(["a", "b"])).not.toThrow();

      // Invalid: an element fails the item schema
      expect(() => instance.send(["a", ""])).toThrow();
    });

    it("should validate output when validateOutput is true", () => {
      const outputSchema = defineSchema(
        { result: SchemaType.String({ minLength: 1 }) },
        { $id: "io-output-validation-test" },
      );

      class ValidatedOutputNode extends IONode {
        static override readonly type = "validated-output";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateOutput = true;
        static override readonly outputsSchema = outputSchema;
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new ValidatedOutputNode(RED, node, {}, {});

      expect(() => instance.send({ result: "" })).toThrow();
    });

    it("lets Unsafe<T>() ports carry non-data values past output validation", () => {
      // Non-data ports (a function, class instance, Buffer, stream, connection)
      // can't be JSON-validated. Unsafe<T>() is an empty schema, so AJV passes
      // any runtime value through — while sibling data fields are still checked.
      const outputSchema = defineSchema(
        {
          handler: SchemaType.Unsafe<() => void>(),
          name: SchemaType.String({ minLength: 1 }),
        },
        { $id: "io-output-unsafe-nondata-test" },
      );

      class NonDataOutputNode extends IONode {
        static override readonly type = "nondata-output";
        static override readonly category = "function";
        static override readonly color = "#ffffff" as const;
        static override readonly validateOutput = true;
        static override readonly outputsSchema = outputSchema;
        public override async input() {}
      }

      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new NonDataOutputNode(RED, node, {}, {});

      // The function in the Unsafe field passes validation.
      expect(() =>
        instance.send({ handler: () => {}, name: "ok" }),
      ).not.toThrow();

      // Discriminating: the Unsafe field is exempt, but the sibling data field
      // is still validated — an empty name throws. Guards against a
      // "passes everything" false positive.
      expect(() => instance.send({ handler: () => {}, name: "" })).toThrow();
    });
  });

  describe("status", () => {
    it("should delegate to node.status", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.status({ fill: "green", shape: "dot", text: "connected" });
      expect(node.status).toHaveBeenCalledWith({
        fill: "green",
        shape: "dot",
        text: "connected",
      });
    });
  });

  describe("updateWires", () => {
    it("should delegate to node.updateWires", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.updateWires([["a"], ["b"]]);
      expect(node.updateWires).toHaveBeenCalledWith([["a"], ["b"]]);
    });
  });

  describe("receive", () => {
    it("should delegate to node.receive", () => {
      const RED = createRED();
      initValidator(RED);
      const node = createNodeRedNode();
      const instance = new TestIONode(RED, node, {}, {});

      instance.receive({ payload: "test" });
      expect(node.receive).toHaveBeenCalledWith({ payload: "test" });
    });
  });
});
