import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import { chromium, type Browser } from "playwright";
import { NodeRedEditor } from "@/sdk/test/client/e2e";

// Per-port OUTPUT SCHEMA editor: a node that declares `outputSchemas` gets a
// gated "Schema" column in the Outputs table. The button opens a Monaco (JSON)
// tray to set a port's data-validation schema. Gating: the column shows only
// when the node opts in; a port's button is enabled only when the author made it
// overridable AND its Validate Data toggle is on.
describe("output schema editor (chromium)", () => {
  let browser: Browser;
  let editor: NodeRedEditor;

  beforeAll(async () => {
    browser = await chromium.launch();
    const page = await browser.newPage();
    editor = new NodeRedEditor(page, Number(process.env.NODE_RED_PORT), {
      screenshotDir: "test-results/screenshots",
    });
    await editor.open();
  });

  afterAll(async () => {
    await browser.close();
  });

  afterEach(async () => {
    await editor.closeAllTrays();
    editor.expectNoPageErrors();
  });

  test("renders a gated Schema column and opens a Monaco tray", async () => {
    await editor.editNode("n5");
    const page = editor.page;

    // Opted in → the Schema column header renders.
    const th = page.locator("th.nrg-outputs-flag", { hasText: "Schema" });
    await th.waitFor({ state: "visible", timeout: 10_000 });
    expect(await th.isVisible()).toBe(true);

    const btn0 = page.locator('[aria-label="Schema — Output 0"]');
    const btn1 = page.locator('[aria-label="Schema — Output 1"]');
    await btn0.scrollIntoViewIfNeeded();

    // Validate Data is off for every port initially → port 0's button is
    // disabled; port 1 has no author default → never overridable.
    expect(await btn0.isDisabled()).toBe(true);
    expect(await btn1.isDisabled()).toBe(true);

    // Turn Validate Data on for port 0 → its button enables; port 1 stays off.
    // The checkbox itself is visually hidden (styled toggle), so click its label.
    await page
      .locator(
        'label.nrg-toggle:has(input[aria-label="Validate Data — Output 0"])',
      )
      .click();
    await expect.poll(() => btn0.isEnabled(), { timeout: 5_000 }).toBe(true);
    expect(await btn1.isDisabled()).toBe(true);

    // Click → a schema-editor tray stacks on top with a Monaco (JSON) editor,
    // seeded with the author default schema (`{ "type": "object" }`).
    await btn0.click();
    const editorTray = page.locator(".red-ui-tray").last();
    await editorTray
      .locator(".monaco-editor")
      .waitFor({ state: "visible", timeout: 10_000 });
    expect(await editorTray.textContent()).toContain("type");

    await editor.screenshot("chromium-output-schema-editor");
  });
});
