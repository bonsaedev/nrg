import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConfigNode } from "../../../../../src/core/server/nodes/config-node";
import { initValidator } from "../../../../../src/core/server/validator";
import { createMockRED, createMockNodeRedNode } from "../../../../mocks/red";

class TestConfigNode extends ConfigNode {
  static override readonly type = "test-config-node";
}

describe("ConfigNode", () => {
  beforeEach(() => {
    initValidator(createMockRED());
  });

  describe("constructor", () => {
    it("should set category to config", () => {
      expect(TestConfigNode.category).toBe("config");
    });

    it("should set up context with node and global", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (TestConfigNode as any)(RED, node, { _users: [] }, {});

      expect(instance.context).toBeDefined();
      expect(instance.context.node).toBeDefined();
      expect(instance.context.global).toBeDefined();
    });

    it("should support context as a function with scope", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (TestConfigNode as any)(
        RED,
        node,
        { _users: [] },
        {},
      );

      const globalCtx = instance.context("global");
      expect(globalCtx).toBeDefined();
      expect(globalCtx.get).toBeDefined();
    });
  });

  describe("userIds", () => {
    it("should return _users from config", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (TestConfigNode as any)(
        RED,
        node,
        { _users: ["user-1", "user-2"] },
        {},
      );

      expect(instance.userIds).toEqual(["user-1", "user-2"]);
    });
  });

  describe("users", () => {
    it("should resolve user IDs to node instances", () => {
      const userNode1 = { _node: { id: "user-1", type: "my-node" } };
      const userNode2 = { _node: { id: "user-2", type: "my-node" } };
      const RED = createMockRED({
        "user-1": userNode1,
        "user-2": userNode2,
      });
      const node = createMockNodeRedNode();
      const instance = new (TestConfigNode as any)(
        RED,
        node,
        { _users: ["user-1", "user-2"] },
        {},
      );

      const users = instance.users;
      expect(users).toHaveLength(2);
      expect(users[0]).toBe(userNode1._node);
      expect(users[1]).toBe(userNode2._node);
    });

    it("should filter out missing nodes", () => {
      const userNode1 = { _node: { id: "user-1" } };
      const RED = createMockRED({
        "user-1": userNode1,
      });
      const node = createMockNodeRedNode();
      const instance = new (TestConfigNode as any)(
        RED,
        node,
        { _users: ["user-1", "missing-id"] },
        {},
      );

      const users = instance.users;
      expect(users).toHaveLength(1);
      expect(users[0]).toBe(userNode1._node);
    });
  });

  describe("getUser", () => {
    it("should return user at index", () => {
      const userNode = { _node: { id: "user-1", type: "my-node" } };
      const RED = createMockRED({ "user-1": userNode });
      const node = createMockNodeRedNode();
      const instance = new (TestConfigNode as any)(
        RED,
        node,
        { _users: ["user-1"] },
        {},
      );

      expect(instance.getUser(0)).toBe(userNode._node);
    });

    it("should return undefined for out-of-bounds index", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode();
      const instance = new (TestConfigNode as any)(
        RED,
        node,
        { _users: [] },
        {},
      );

      expect(instance.getUser(0)).toBeUndefined();
    });

    it("should return undefined when node is not found", () => {
      const RED = createMockRED({});
      const node = createMockNodeRedNode();
      const instance = new (TestConfigNode as any)(
        RED,
        node,
        { _users: ["missing"] },
        {},
      );

      expect(instance.getUser(0)).toBeUndefined();
    });
  });

  describe("credentials", () => {
    it("should return node.credentials", () => {
      const RED = createMockRED();
      const node = createMockNodeRedNode({ credentials: { secret: "abc" } });
      const instance = new (TestConfigNode as any)(
        RED,
        node,
        { _users: [] },
        {},
      );

      expect(instance.credentials).toEqual({ secret: "abc" });
    });
  });
});
