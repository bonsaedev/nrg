declare module "virtual:nrg/node-definitions" {
  import type { NodeDefinitionApiResponse } from "../server/types";
  const definitions: Record<string, NodeDefinitionApiResponse>;
  export default definitions;
}
