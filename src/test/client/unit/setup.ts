import "../globals";
import { beforeEach } from "vitest";
import { createRED, createJQuery } from "../mocks";

const RED = createRED();

window.$ = createJQuery();
window.RED = RED;

beforeEach(() => {
  RED.settings = {};
});
