import { describe, test, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { NodeRedEditor } from "@/sdk/test/client/e2e";
import { FIXTURE_FLOW } from "./global-setup";

// Not an assertion test — it drives the real Node-RED editor to capture the
// README's greeting-node form screenshot (assets/greeting-form.png) so the docs
// image can be regenerated from the exact schema the README shows.
//
// OPT-IN ONLY (run with NRG_SCREENSHOTS=1). It shares the single Node-RED
// instance with the other e2e files and its `beforeAll` does a full destructive
// `deployFlow`, so — like port-topology.screenshot.test.ts — it is skipped
// unless explicitly regenerating docs, and restores the fixture flow after.
const GENERATE = Boolean(process.env.NRG_SCREENSHOTS);
const PORT = Number(process.env.NODE_RED_PORT);
const OUT = "/tmp/nrg-greeting-screen";

const FLOW: Record<string, unknown>[] = [
  { id: "tabG", type: "tab", label: "Greeting" },
  {
    id: "greet1",
    type: "greeting",
    z: "tabG",
    name: "",
    greeting: "Hello",
    style: "plain",
    repeat: 1,
    note: "",
    x: 320,
    y: 100,
    wires: [[]],
  },
];

describe.skipIf(!GENERATE)("greeting form screenshot", () => {
  let browser: Browser;
  let page: Page;
  let editor: NodeRedEditor;

  beforeAll(async () => {
    browser = await chromium.launch();
    page = await browser.newPage({ deviceScaleFactor: 2 });
    editor = new NodeRedEditor(page, PORT, { screenshotDir: OUT });
    await editor.open();
    await editor.deployFlow(FLOW);
    await page.waitForTimeout(1500);
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    // Restore the shared fixture flow so other e2e tests (same Node-RED) are
    // unaffected by this generator's full deploy.
    await fetch(`http://localhost:${PORT}/flows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Node-RED-Deployment-Type": "full",
      },
      body: JSON.stringify(FIXTURE_FLOW),
    });
  });

  test("captures the greeting node edit form", async () => {
    await editor.editNode("greet1");
    await editor.captureForm("greeting-form");
  }, 60_000);
});
