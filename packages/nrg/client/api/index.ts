import { type NodeDefinitionApiResponse } from "../../server/types";

async function fetchNodeDefinition(
  type: string,
): Promise<NodeDefinitionApiResponse> {
  const response = await fetch(`/nrg/nodes/${type}`);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch node definition for "${type}": ${response.status}`,
    );
  }

  return response.json() as Promise<NodeDefinitionApiResponse>;
}

export { fetchNodeDefinition };
