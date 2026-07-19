// Test-only `sent()` typing for IONode — nrg's OWN-source variant.
//
// `sent()` must be typed from a node's declared `TOutput` (the `Outputs<…>` port
// map), but `TOutput` can't be recovered from a passed node class — the
// constrained `send(port, value)` signature keeps it only inside conditional
// types (`OutputPortNames<TOutput>`), which TS won't run backwards. So `sent()` is
// declared right on `IONode` here, where `TInput`/`TOutput` are lexically in
// scope — no phantom field needed.
//
// A module augmentation only merges into the module that DECLARES `IONode`, never
// a re-export barrel. In THIS repo, `IONode` is declared in
// `@/sdk/lib/server/nodes/io-node`, so that's the target. The shipped-package
// variant (targeting `@bonsae/nrg/server`, which a consumer imports and which — as
// a bundled `.d.ts` — declares `IONode` directly) lives in a SEPARATE file
// (`shims/sent.d.ts`) that nrg's own tsconfigs never compile, because augmenting
// the source `@bonsae/nrg/server` re-export barrel would collide with `IONode`'s
// protected members.
//
// Loaded via `files` in the base TEST tsconfigs, so `sent` exists whenever a test
// tsconfig is in effect and is ABSENT from a production build.
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

declare module "@/sdk/lib/server/nodes/io-node" {
  interface IONode<
    TConfig,
    TCredentials,
    TInput extends InputSpec,
    TOutput extends OutputSpec,
    TSettings,
  > {
    /** Phantom port-map marker — never assigned, present only in test typings.
     * The integration harness returns a wrapper handle (not the node instance),
     * so it can't read `TInput`/`TOutput` in lexical scope the way `sent()` does
     * here; it recovers them structurally from this marker instead. */
    readonly ["~nrgPortMaps"]?: { input: TInput; output: TOutput };
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
