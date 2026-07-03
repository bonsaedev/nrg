import { describe, it, expectTypeOf } from "vitest";
import { Type, Kind, type TObject, type TProperties } from "@sinclair/typebox";
import type { Infer, NamedPortsBrand } from "@/core/server/schemas/types";
import type TypedInput from "@/core/server/typed-input";
import type {
  TypedInputBrand,
  TNodeRef,
  TTypedInput,
} from "@/core/shared/schemas/types";

function nodeRef<T>(): TNodeRef<T> {
  return { [Kind]: "NodeRef", type: "string", format: "node-id" } as any;
}

function typedInput<T = unknown>(): TTypedInput<T> {
  return { [Kind]: "TypedInput" } as any;
}

function schema<T extends TProperties>(props: T) {
  return Type.Object(props) as TObject<T>;
}

describe("Server Infer", () => {
  it("infers string from TString", () => {
    const s = schema({ name: Type.String() });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{ name: string }>();
  });

  it("infers number from TNumber", () => {
    const s = schema({ count: Type.Number() });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{ count: number }>();
  });

  it("infers boolean from TBoolean", () => {
    const s = schema({ enabled: Type.Boolean() });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{ enabled: boolean }>();
  });

  it("resolves NodeRef to the referenced type", () => {
    interface ServerConfig {
      host: string;
      port: number;
    }
    const s = schema({ server: nodeRef<ServerConfig>() });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{
      server: ServerConfig;
    }>();
  });

  it("resolves TypedInput to TypedInput<T> class instance", () => {
    const s = schema({ target: typedInput<string>() });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{
      target: TypedInput<string>;
    }>();
  });

  it("TypedInput schema carries the shared TypedInputBrand brand", () => {
    // The schema's `static` carrier is the nominal TypedInputBrand<T> brand
    // (server-class-free). Each plane maps it: server ResolvedStatic →
    // TypedInput<T>, client EditorStatic → TypedInput. If the carrier
    // stops being the brand, both planes' inference would silently degrade, so
    // this must stay a compile-time guarantee.
    expectTypeOf<TTypedInput<string>["static"]>().toEqualTypeOf<
      TypedInputBrand<string>
    >();
  });

  it("infers arrays", () => {
    const s = schema({ tags: Type.Array(Type.String()) });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{ tags: string[] }>();
  });

  it("infers optional properties", () => {
    const s = schema({ label: Type.Optional(Type.String()) });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{
      label?: string | undefined;
    }>();
  });

  it("infers union types", () => {
    const s = schema({
      mode: Type.Union([Type.Literal("a"), Type.Literal("b")]),
    });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{ mode: "a" | "b" }>();
  });

  it("infers mixed schemas with NodeRef and TypedInput", () => {
    interface BrokerConfig {
      host: string;
    }
    const s = schema({
      name: Type.String(),
      count: Type.Number(),
      broker: nodeRef<BrokerConfig>(),
      target: typedInput<number>(),
      verbose: Type.Optional(Type.Boolean()),
    });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{
      name: string;
      count: number;
      broker: BrokerConfig;
      target: TypedInput<number>;
      verbose?: boolean | undefined;
    }>();
  });

  it("infers array of NodeRef as array of referenced type", () => {
    interface Node {
      id: string;
    }
    const s = schema({ nodes: Type.Array(nodeRef<Node>()) });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{ nodes: Node[] }>();
  });

  it("infers record of schemas as a NamedPortsBrand-tagged port map", () => {
    const success = schema({ payload: Type.String() });
    const failure = schema({ error: Type.String() });
    const outputs = { success, failure } as const;

    // The record form of Infer carries NamedPortsBrand so named-port routing is
    // sound; the per-port message types are unbranded.
    type Ports = Infer<typeof outputs>;
    expectTypeOf<Ports>().toEqualTypeOf<
      {
        success: { payload: string };
        failure: { error: string };
      } & NamedPortsBrand
    >();
  });

  it("resolves NodeRef inside record of schemas", () => {
    interface Conn {
      url: string;
    }
    const portSchema = schema({ conn: nodeRef<Conn>() });
    const outputs = { data: portSchema } as const;

    type Ports = Infer<typeof outputs>;
    expectTypeOf<Ports>().toEqualTypeOf<
      {
        data: { conn: Conn };
      } & NamedPortsBrand
    >();
  });

  it("does not collapse to any", () => {
    const s = schema({ name: Type.String() });
    expectTypeOf<Infer<typeof s>>().not.toBeAny();
  });

  it("infers nested objects with NodeRef recursively", () => {
    interface DbConn {
      host: string;
    }
    const s = schema({
      outer: Type.Object({
        inner: Type.Object({
          db: nodeRef<DbConn>(),
        }),
      }),
    });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{
      outer: { inner: { db: DbConn } };
    }>();
  });

  it("NodeRef resolves to instance type, not string", () => {
    interface Cfg {
      port: number;
    }
    const s = schema({ ref: nodeRef<Cfg>() });
    type Result = Infer<typeof s>;
    expectTypeOf<Result["ref"]>().toEqualTypeOf<Cfg>();
    expectTypeOf<Result["ref"]>().not.toBeString();
  });
});
