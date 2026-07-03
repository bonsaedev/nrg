// The @bonsae/nrg-runtime entry: server + schema VALUES in a single bundle.
//
// At server runtime both planes live server-side, so there is no reason to split
// them — and bundling once means the shared schema layer (SchemaType, defineSchema,
// Kind, markNonValidatable, …) ships a SINGLE copy instead of being duplicated
// across separate server/index.cjs and schema/index.cjs bundles. The client never
// gets these values at all (its schemas are serialized to JSON at build time and
// validated with AJV — no TypeBox), so there is no client runtime that needs the
// schema kit as its own artifact.
//
// The @bonsae/nrg TOOLKIT keeps `./server` and `./schema` as distinct AUTHORING
// specifiers (the browser-safe, cross-plane boundary + types); only this runtime
// artifact collapses them. The server value-exports and the schema value-exports
// are disjoint, so the two star re-exports cannot collide.
export * from "./server";
export * from "./shared/schemas";
