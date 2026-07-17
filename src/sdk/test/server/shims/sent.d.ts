// Test-only `sent()` typing for IONode — the SHIPPED (consumer-facing) variant.
//
// Mirrors `../unit/sent-augment.d.ts`, but targets the PUBLIC specifier
// `@bonsae/nrg/server` a consumer imports `IONode` from. In a consumer that is the
// bundled package `.d.ts`, which DECLARES `IONode` directly, so the augmentation
// merges. (It must NOT be compiled inside THIS repo: here `@bonsae/nrg/server`
// resolves to the source re-export barrel, and augmenting a re-export collides
// with `IONode`'s protected members — so nrg's own tsconfigs exclude this folder,
// and nrg's own tests use the sibling `@/sdk/lib/server/nodes/io-node` variant.)
//
// The build copies this to `dist/toolkit/types/shims/test/server/sent.d.ts`, and
// the base TEST tsconfigs (`tsconfig/test/server/{unit,integration}.json`) load it
// via `files` — so any consumer that `extends` them gets `sent()` typed with zero
// extra setup, and a production tsconfig (which extends `tsconfig/lib/server.json`)
// never sees it.
import type {
  PortTuple,
  WrappedPort,
  PortMessage,
  ExtractInput,
  ErrorPortOutput,
  CompletePortOutput,
  StatusPortOutput,
  OutputPortNames,
  InputSpec,
  OutputSpec,
  PortValue,
  PortChannels,
  Port,
} from "@bonsae/nrg/test/server/unit";

declare module "@bonsae/nrg/server" {
  interface IONode<
    TConfig,
    TCredentials,
    TInput extends InputSpec,
    TOutput extends OutputSpec,
    TSettings,
  > {
    /** All raw emissions, each a positional array — `sent()[i][0]` is port 0 of
     * emission `i`, typed from the node's declared output. Read one port directly
     * with `sent(name)` / `sent(port)`, including the built-in lifecycle ports by
     * name: `sent("error")`, `sent("complete")`, `sent("status")`. */
    sent(): PortTuple<TOutput, ExtractInput<this>>[];
    sent(port: "error"): ErrorPortOutput[];
    sent(port: "complete"): CompletePortOutput[];
    sent(port: "status"): StatusPortOutput[];
    sent<P extends OutputPortNames<TOutput>>(
      port: P,
    ): WrappedPort<
      PortMessage<TOutput, P>,
      ExtractInput<this>,
      PortChannels<TOutput[P]>
    >[];
    // A numeric index into a dynamic-array / tuple output recovers the element
    // value + channels; a named record (key order not recoverable) stays `unknown`.
    sent(
      port: number,
    ): TOutput extends readonly Port<any>[]
      ? WrappedPort<
          PortValue<TOutput[number]>,
          ExtractInput<this>,
          PortChannels<TOutput[number]>
        >[]
      : WrappedPort<unknown, ExtractInput<this>>[];
  }
}
