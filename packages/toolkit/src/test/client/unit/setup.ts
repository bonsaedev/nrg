import "../globals";
import { beforeEach } from "vitest";
import { createRED, createJQuery, resetRED } from "../mocks";

window.$ = createJQuery();
window.RED = createRED();

// Reset RED state per test (registries, listeners, subscriptions, settings)
// while keeping the same object — module-scope `const RED = window.RED`
// captures in test files stay valid.
beforeEach(() => {
  resetRED(window.RED);
});
