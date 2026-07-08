import AllFieldsNode from "./nodes/all-fields-node";
import TestConfig from "./nodes/test-config";
import CustomFormNode from "./nodes/custom-form-node";
import BasicNode from "./nodes/basic-node";
import CtxModesNode from "./nodes/ctx-modes-node";
import OutputSchemaNode from "./nodes/output-schema-node";
import PortsSource from "./nodes/ports-source";
import PortsTrigger from "./nodes/ports-trigger";
import PortsRoute from "./nodes/ports-route";
import PortsSink from "./nodes/ports-sink";

export default {
  nodes: [
    AllFieldsNode,
    TestConfig,
    CustomFormNode,
    BasicNode,
    CtxModesNode,
    OutputSchemaNode,
    PortsSource,
    PortsTrigger,
    PortsRoute,
    PortsSink,
  ],
};
