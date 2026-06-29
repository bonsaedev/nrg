/**
 * Type-level contract shared by the server and client planes.
 *
 * `Static<>` of NRG's special schemas (NodeRef, TypedInput) produces these
 * brand shapes. Each plane maps them differently:
 *
 * - server `ResolvedStatic` (server/schemas/types): brand → runtime value
 *   (NodeRef → the node instance, TypedInput → the resolving wrapper)
 * - client `EditorStatic` (client/types): brand → editor form value
 *   (NodeRef → the referenced node id string, TypedInput → { value, type })
 *
 * Both planes import the brands from here, type-only, so renaming or
 * reshaping a brand is a compile error on both sides instead of silent
 * type drift. Keep this module free of runtime code and imports from
 * either plane.
 */

/** Brand produced by `Static` of a NodeRef schema. */
interface NodeRefResolved<T = any> {
  readonly __nrg_node_ref: true;
  readonly __instance: T;
}

/**
 * Brand produced by `Static` of a TypedInput schema. Carries the resolved value
 * type `T` so each plane can map it: the server `ResolvedStatic` maps it to the
 * `TypedInput<T>` class instance (with `.resolve()`); the client `EditorStatic`
 * maps it to the raw `{ value, type }` editor pair. Nominal (not structural) so
 * the shared schema type never needs to reference the server `TypedInput` class.
 */
interface TypedInputResolved<T = unknown> {
  readonly __nrg_typed_input: true;
  readonly __value: T;
}

/**
 * Brand produced by `Static` of an `Unsafe<T>` schema. Carries `T` so both
 * planes resolve it straight back to `T` unchanged. Without the brand, a class
 * instance passed via `Unsafe<Conn>` would be deep-mapped by `ResolvedStatic`/
 * `EditorStatic` into a structural object, silently dropping private/protected/
 * `#` members so the result is no longer assignable to `Conn` (TS2741) — exactly
 * the documented non-data-value use case (connections, streams, Buffers).
 */
interface UnsafeResolved<T = unknown> {
  readonly __nrg_unsafe: true;
  readonly __value: T;
}

/**
 * Type-only marker carried by every nrg config node — the server `ConfigNode`
 * class and the `IConfigNode` interface both declare it. It lets the
 * browser-safe `NodeRef<T>` builder constrain `T` to a config node WITHOUT the
 * shared layer importing the server `ConfigNode` type: shared owns the marker,
 * and the server's config-node types declare they carry it. Phantom — declared
 * type-only, never a real runtime field.
 */
interface ConfigNodeBrand {
  readonly __nrg_config_node: true;
}

export type {
  NodeRefResolved,
  TypedInputResolved,
  UnsafeResolved,
  ConfigNodeBrand,
};
