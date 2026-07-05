import TestNode from "./nodes/test-node";
import SecondNode from "./nodes/second-node";
import ConfigServer from "./nodes/config-server";
import RouterNode from "./nodes/router-node";
import PortNode from "./nodes/port-node";

export default {
  nodes: [TestNode, SecondNode, ConfigServer, RouterNode, PortNode],
};
