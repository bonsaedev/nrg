import "./globals";
import { beforeEach } from "vitest";
import { createRED, resetRED, createJQuery } from "./mocks";

/**
 * Install the Node-RED editor mocks (`RED` and jQuery `$`) on `window` and reset
 * RED's state before each test. Shared by the unit and component setups.
 *
 * The reset is in place (`resetRED`), not a fresh `window.RED = createRED()`,
 * so the RED reference and spies that test files capture once at collection
 * time stay valid — see resetRED's note in mocks/red.ts.
 */
export function installEditorMocks(): void {
  window.$ = createJQuery();
  window.RED = createRED();
  beforeEach(() => {
    resetRED(window.RED);
  });
}
