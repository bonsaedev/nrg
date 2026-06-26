import { provideSchemas } from "@/test/client/component/schemas";
import registry from "./schema-registry";

// Exercises the real schemas globalSetup: serialize a node registry in Node and
// provide it to the browser tests as data. Uses the provideSchemas() factory
// with an explicit fixture registry (the monorepo root has no src/server entry
// for the convention default to import).
export default provideSchemas(registry);
