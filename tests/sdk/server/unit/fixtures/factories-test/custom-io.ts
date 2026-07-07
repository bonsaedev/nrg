import { defineIONode } from "@/sdk/lib/server";

// A types-first functional-API node with CUSTOM metadata and a topology that
// comes only from the generics: a `never` input declares NO input port, while a
// 3-element tuple output declares THREE positional output ports. Proves the
// factory keeps the author's category/color/align while inputs=0 / outputs=3 are
// derived from the types, not from any schema.
type Output = [{ value: number }, { value: number }, { value: number }];

const CustomIO = defineIONode<any, any, never, Output>({
  type: "custom-io",
  category: "network",
  color: "#ff6633",
  align: "right",
  input() {},
});

export default CustomIO;
