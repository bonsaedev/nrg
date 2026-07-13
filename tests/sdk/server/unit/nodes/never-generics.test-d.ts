import {
  defineModule,
  IONode,
  ConfigNode,
  type Input,
  type Outputs,
  type Port,
} from "@bonsae/nrg/server";

// A `never` generic means "this node has none of X" — the I/O-port contract
// extended to config/credentials/settings. These proofs pin two guarantees:
//   1. `never` config/credentials/settings all type-check AND register (a `never`
//      constructor param must not make the class unassignable to NodeConstructor).
//   2. The Node-RED built-in config fields (id/type/name/z) survive `never` config
//      — they exist at runtime whatever the author's schema is.

// ── never CONFIG — built-ins survive, and `this.config` stays a real type ─────
class NoConfig extends IONode<
  never,
  any,
  Input<Port<{ p: string }>>,
  Outputs<{ out: Port<string> }>
> {
  static override readonly type = "no-config";
  override async input() {
    this.config.id satisfies string;
    this.config.type satisfies string;
    this.config.name satisfies string;
    this.config.z satisfies string | undefined;
    // Not `any`: an unknown field is still rejected.
    // @ts-expect-error — no such field on a never-config node
    this.config.nope;
  }
}

// ── never CREDENTIALS — registers; `this.credentials` is undefined ────────────
class NoCreds extends IONode<
  { a: string },
  never,
  Input<Port<{ p: string }>>,
  Outputs<{ out: Port<string> }>
> {
  static override readonly type = "no-creds";
  override async input() {
    this.config.a satisfies string; // user field still typed
    this.config.name satisfies string; // built-in still present
    this.credentials satisfies undefined; // no credentials
  }
}

// ── never SETTINGS — registers (settings is not a constructor param) ──────────
class NoSettings extends IONode<
  { a: string },
  any,
  Input<Port<{ p: string }>>,
  Outputs<{ out: Port<string> }>,
  never
> {
  static override readonly type = "no-settings";
}

// ── never CREDENTIALS on a ConfigNode too ─────────────────────────────────────
class NoCredsConfig extends ConfigNode<{ a: string }, never> {
  static override readonly type = "no-creds-config";
}

// All four register — `never` no longer poisons the contravariant constructor
// params, so each class is assignable to NodeConstructor.
defineModule({ nodes: [NoConfig, NoCreds, NoSettings, NoCredsConfig] });
