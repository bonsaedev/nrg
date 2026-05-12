import CustomNode from "./nodes/custom-node";
import ConfigServer from "./nodes/config-server";
import NoSchemaNode from "./nodes/no-schema-node";
import MinimalNode from "./nodes/minimal-node";

export default {
  nodes: [CustomNode, ConfigServer, NoSchemaNode, MinimalNode],
};
