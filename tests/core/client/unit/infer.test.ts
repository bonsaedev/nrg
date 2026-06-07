import { describe, it, expectTypeOf } from "vitest";
import { Type, Kind, type TObject, type TProperties } from "@sinclair/typebox";
import type { TNodeRef, TTypedInput } from "@/core/server/schemas/types";
import type { Infer, TypedInputValue } from "@/core/client/types";

function nodeRef<T>(): TNodeRef<T> {
  return { [Kind]: "NodeRef", type: "string", format: "node-id" } as any;
}

function typedInput<T = unknown>(): TTypedInput<T> {
  return { [Kind]: "TypedInput" } as any;
}

function schema<T extends TProperties>(props: T) {
  return Type.Object(props) as TObject<T>;
}

describe("Infer", () => {
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

  it("infers string from NodeRef", () => {
    const s = schema({ server: nodeRef<{ id: string }>() });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{ server: string }>();
  });

  it("infers TypedInputValue from TypedInput", () => {
    const s = schema({ target: typedInput() });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{
      target: TypedInputValue;
    }>();
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
    const s = schema({
      name: Type.String(),
      count: Type.Number(),
      server: nodeRef<{ host: string }>(),
      target: typedInput<string>(),
      enabled: Type.Optional(Type.Boolean()),
    });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{
      name: string;
      count: number;
      server: string;
      target: TypedInputValue;
      enabled?: boolean | undefined;
    }>();
  });

  it("infers array of NodeRef as string[]", () => {
    const s = schema({ servers: Type.Array(nodeRef()) });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{ servers: string[] }>();
  });

  it("infers standalone schema (non-object)", () => {
    expectTypeOf<Infer<ReturnType<typeof nodeRef>>>().toEqualTypeOf<string>();
    expectTypeOf<
      Infer<ReturnType<typeof typedInput>>
    >().toEqualTypeOf<TypedInputValue>();
  });

  it("infers nested objects with NodeRef recursively", () => {
    const s = schema({
      outer: Type.Object({
        inner: Type.Object({
          server: nodeRef<{ host: string }>(),
        }),
      }),
    });
    expectTypeOf<Infer<typeof s>>().toEqualTypeOf<{
      outer: { inner: { server: string } };
    }>();
  });

  it("does not collapse to any", () => {
    const s = schema({ name: Type.String() });
    expectTypeOf<Infer<typeof s>>().not.toBeAny();
  });

  it("NodeRef does not resolve to NodeRefResolved on client", () => {
    const s = schema({ server: nodeRef<{ id: string }>() });
    type Result = Infer<typeof s>;
    expectTypeOf<Result["server"]>().toBeString();
    expectTypeOf<Result["server"]>().not.toEqualTypeOf<{ id: string }>();
  });
});

