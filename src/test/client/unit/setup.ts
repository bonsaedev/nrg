import { beforeEach } from "vitest";
import { createRED, createJQuery } from "../mocks";

const RED = createRED();

(window as any).$ = createJQuery();
(window as any).RED = RED;

beforeEach(() => {
  RED.settings = {};
});
