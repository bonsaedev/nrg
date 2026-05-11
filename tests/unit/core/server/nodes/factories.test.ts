import { describe, it, expect, vi } from "vitest";
import {
  defineIONode,
  defineConfigNode,
} from "../../../../../src/core/server/nodes/factories";
import { defineModule } from "../../../../../src/core/server/index";
import { IONode } from "../../../../../src/core/server/nodes/io-node";
import { ConfigNode } from "../../../../../src/core/server/nodes/config-node";
import { Node } from "../../../../../src/core/server/nodes/node";
import {
  defineSchema,
  SchemaType,
} from "../../../../../src/core/server/schemas";
import { initValidator } from "../../../../../src/core/server/validation";
import { createNodeRedRuntime, createNodeRedNode } from "../../../../mocks/red";

describe("defineIONode", () => {

  it("should create a class with the correct static type", () => {
    const Node = defineIONode({
      type: "test-io",
      input() {},
    });
    expect(Node.type).toBe("test-io");
  });

  it("should set default static properties", () => {
    const Node = defineIONode({
      type: "defaults-io",
      inputSchema: SchemaType.Object({}),
      outputsSchema: SchemaType.Object({}),
      input() {},
    });
    expect(Node.category).toBe("function");
    expect(Node.color).toBe("#a6bbcf");
    expect(Node.inputs).toBe(1);
    expect(Node.outputs).toBe(1);
    expect(Node.validateInput).toBe(false);
    expect(Node.validateOutput).toBe(false);
  });

  it("should derive inputs and outputs from schemas", () => {
    const Node = defineIONode({
      type: "custom-io",
      category: "network",
      color: "#ff6633",
      align: "right",
      outputsSchema: [
        SchemaType.Object({}),
        SchemaType.Object({}),
        SchemaType.Object({}),
      ],
      validateInput: true,
      validateOutput: true,
      input() {},
    });
    expect(Node.category).toBe("network");
    expect(Node.color).toBe("#ff6633");
    expect(Node.inputs).toBe(0);
    expect(Node.outputs).toBe(3);
    expect(Node.align).toBe("right");
    expect(Node.validateInput).toBe(true);
    expect(Node.validateOutput).toBe(true);
  });

  it("should set a readable class name from the type", () => {
    const Node = defineIONode({
      type: "my-custom-node",
      input() {},
    });
    expect(Node.name).toBe("MyCustomNode");
  });

  it("should attach schemas as static properties", () => {
    const configSchema = defineSchema(
      { name: SchemaType.String({ default: "" }) },
      { $id: "define-io-config" },
    );
    const credsSchema = defineSchema(
      { key: SchemaType.String({ format: "password" }) },
      { $id: "define-io-creds" },
    );
    const inputSchema = defineSchema(
      { payload: SchemaType.String() },
      { $id: "define-io-input" },
    );
    const outputSchema = defineSchema(
      { result: SchemaType.String() },
      { $id: "define-io-output" },
    );

    const Node = defineIONode({
      type: "schemas-io",
      configSchema,
      credentialsSchema: credsSchema,
      inputSchema,
      outputsSchema: outputSchema,
      input() {},
    });

    expect(Node.configSchema).toBe(configSchema);
    expect(Node.credentialsSchema).toBe(credsSchema);
    expect(Node.inputSchema).toBe(inputSchema);
    expect(Node.outputsSchema).toBe(outputSchema);
  });

  it("should call input handler with the correct this context", async () => {
    const inputFn = vi.fn(function (this: any, msg: any) {
      this.log(`received: ${msg.payload}`);
      this.send({ result: msg.payload });
    });

    const Node = defineIONode({
      type: "input-context-io",
      input: inputFn,
    });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    const node = createNodeRedNode();
    const instance = new (Node as any)(RED, node, {}, {});

    await instance._input({ payload: "hello" }, vi.fn());

    expect(inputFn).toHaveBeenCalledOnce();
    expect(node.log).toHaveBeenCalledWith("received: hello");
  });

  it("should call created handler", async () => {
    const createdFn = vi.fn(function (this: any) {
      this.log("created");
    });

    const Node = defineIONode({
      type: "created-io",
      created: createdFn,
      input() {},
    });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    const node = createNodeRedNode();
    const instance = new (Node as any)(RED, node, {}, {});

    await instance.created();

    expect(createdFn).toHaveBeenCalledOnce();
    expect(node.log).toHaveBeenCalledWith("created");
  });

  it("should call closed handler", async () => {
    const closedFn = vi.fn(function (this: any, removed?: boolean) {
      this.log(`closed: ${removed}`);
    });

    const Node = defineIONode({
      type: "closed-io",
      closed: closedFn,
      input() {},
    });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    const node = createNodeRedNode();
    const instance = new (Node as any)(RED, node, {}, {});

    await instance.closed(true);

    expect(closedFn).toHaveBeenCalledWith(true);
    expect(node.log).toHaveBeenCalledWith("closed: true");
  });

  it("should call registered handler", async () => {
    const registeredFn = vi.fn();

    const Node = defineIONode({
      type: "registered-io",
      registered: registeredFn,
      input() {},
    });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    await (Node as any)._registered(RED);

    expect(registeredFn).toHaveBeenCalledWith(RED);
  });

  it("should not throw when optional handlers are not provided", async () => {
    const Node = defineIONode({
      type: "minimal-io",
      input() {},
    });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    const node = createNodeRedNode();
    const instance = new (Node as any)(RED, node, {}, {});

    await expect(instance.created()).resolves.not.toThrow();
    await expect(instance.closed()).resolves.not.toThrow();
  });

  it("should return a class that extends IONode", () => {
    const NodeClass = defineIONode({
      type: "extends-io",
      input() {},
    });

    expect(NodeClass.prototype).toBeInstanceOf(IONode);
    expect(NodeClass.prototype).toBeInstanceOf(Node);
  });

  it("should produce instances of IONode", () => {
    const NodeClass = defineIONode({
      type: "instance-io",
      input() {},
    });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    const node = createNodeRedNode();
    const instance = new (NodeClass as any)(RED, node, {}, {});

    expect(instance).toBeInstanceOf(IONode);
    expect(instance).toBeInstanceOf(Node);
  });
});

describe("defineConfigNode", () => {

  it("should create a class with the correct static type", () => {
    const Node = defineConfigNode({ type: "test-config" });
    expect(Node.type).toBe("test-config");
  });

  it("should set category to config", () => {
    const Node = defineConfigNode({ type: "config-cat" });
    expect(Node.category).toBe("config");
  });

  it("should set a readable class name", () => {
    const Node = defineConfigNode({ type: "remote-server" });
    expect(Node.name).toBe("RemoteServer");
  });

  it("should attach schemas as static properties", () => {
    const configSchema = defineSchema(
      { host: SchemaType.String({ default: "localhost" }) },
      { $id: "define-config-schema" },
    );

    const Node = defineConfigNode({
      type: "schemas-config",
      configSchema,
    });

    expect(Node.configSchema).toBe(configSchema);
  });

  it("should call created handler with correct this context", async () => {
    const configSchema = defineSchema(
      { host: SchemaType.String({ default: "localhost" }) },
      { $id: "define-config-created" },
    );

    const createdFn = vi.fn(function (this: any) {
      this.log(`host: ${this.config.host}`);
    });

    const Node = defineConfigNode({
      type: "created-config",
      configSchema,
      created: createdFn,
    });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    const node = createNodeRedNode();
    const instance = new (Node as any)(
      RED,
      node,
      { host: "example.com", _users: [] },
      {},
    );

    await instance.created();

    expect(createdFn).toHaveBeenCalledOnce();
  });

  it("should call closed handler", async () => {
    const closedFn = vi.fn(function (this: any, removed?: boolean) {
      this.log(`closed: ${removed}`);
    });

    const Node = defineConfigNode({
      type: "closed-config",
      closed: closedFn,
    });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    const node = createNodeRedNode();
    const instance = new (Node as any)(RED, node, { _users: [] }, {});

    await instance.closed(false);

    expect(closedFn).toHaveBeenCalledWith(false);
  });

  it("should call registered handler", async () => {
    const registeredFn = vi.fn();

    const Node = defineConfigNode({
      type: "registered-config",
      registered: registeredFn,
    });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    await (Node as any)._registered(RED);

    expect(registeredFn).toHaveBeenCalledWith(RED);
  });

  it("should not throw when optional handlers are not provided", async () => {
    const Node = defineConfigNode({ type: "minimal-config" });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    const node = createNodeRedNode();
    const instance = new (Node as any)(RED, node, { _users: [] }, {});

    await expect(instance.created()).resolves.not.toThrow();
    await expect(instance.closed()).resolves.not.toThrow();
  });

  it("should return a class that extends ConfigNode", () => {
    const NodeClass = defineConfigNode({ type: "extends-config" });

    expect(NodeClass.prototype).toBeInstanceOf(ConfigNode);
    expect(NodeClass.prototype).toBeInstanceOf(Node);
  });

  it("should produce instances of ConfigNode with userIds", () => {
    const NodeClass = defineConfigNode({ type: "instance-config" });

    const RED = createNodeRedRuntime();
    initValidator(RED);
    const node = createNodeRedNode();
    const instance = new (NodeClass as any)(RED, node, { _users: ["u1"] }, {});

    expect(instance).toBeInstanceOf(ConfigNode);
    expect(instance).toBeInstanceOf(Node);
    expect(instance.userIds).toEqual(["u1"]);
  });
});

describe("defineModule", () => {
  it("should return the definition object with the provided nodes", () => {
    const IO = defineIONode({ type: "mod-io", input() {} });
    const Config = defineConfigNode({ type: "mod-config" });

    const mod = defineModule({ nodes: [IO, Config] });

    expect(mod.nodes).toHaveLength(2);
    expect(mod.nodes[0]).toBe(IO);
    expect(mod.nodes[1]).toBe(Config);
  });

  it("should contain nodes that extend the correct base classes", () => {
    const IO = defineIONode({ type: "mod-io-check", input() {} });
    const Config = defineConfigNode({ type: "mod-config-check" });

    const mod = defineModule({ nodes: [IO, Config] });

    expect(mod.nodes[0].prototype).toBeInstanceOf(IONode);
    expect(mod.nodes[1].prototype).toBeInstanceOf(ConfigNode);
  });

  it("should work with an empty nodes array", () => {
    const mod = defineModule({ nodes: [] });
    expect(mod.nodes).toEqual([]);
  });
});
