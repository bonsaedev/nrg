import "../globals";
import { beforeEach } from "vitest";
import { config } from "vitest-browser-vue";
import { createRED, createJQuery } from "../mocks";

config.global.mocks.$i18n = (key: string) => key;

const RED = createRED();

window.$ = createJQuery();
window.RED = RED;

beforeEach(() => {
  RED.settings = {};
});
