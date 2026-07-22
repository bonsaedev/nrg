/**
 * Screenshot the "Type errors" sidebar tab (list + click-to-isolate), for a
 * fan-in flow AND a junction flow — the junction shows how the isolated path
 * behaves when the failing connection runs THROUGH a junction.
 *   cd <repo root> && npx tsx tests/fixtures/wire-check/tab-capture.mts
 * (run `pnpm build` in the repo root AND in ../bonsae-node-red-type-check-plugin first)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import {
  NodeRedTestEnvironment,
  NodeRedEditor,
} from "../../../src/sdk/test/client/e2e";

const FIXTURE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(FIXTURE, "../../..");
const OUT = path.join(REPO, "tab-demo");
const PORT = 1884;

function link(target: string, name: string): void {
  const dir = path.join(FIXTURE, "node_modules/@bonsae");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, name);
  try {
    fs.unlinkSync(dest);
  } catch {
    /* not linked yet */
  }
  fs.symlinkSync(target, dest);
}
link(path.join(REPO, "dist/toolkit"), "nrg");
link(path.join(REPO, "dist/runtime"), "nrg-runtime");
link(
  path.join(REPO, "../bonsae-node-red-type-check-plugin"),
  "node-red-type-check-plugin",
);

process.env.NRG_WIRE_CHECK_SRC = path.join(FIXTURE, "src/server");
const runtimeRes = path.join(
  FIXTURE,
  "node_modules/@bonsae/nrg-runtime/resources",
);
const clientAsset = fs
  .readdirSync(runtimeRes)
  .find((f) => /^nrg\.[0-9a-f]+\.js$/.test(f));
if (!clientAsset) throw new Error("no hashed client asset — run `pnpm build`");
process.env.NRG_CLIENT_ASSET = clientAsset;

type FN = Record<string, unknown>;
const tab: FN = { id: "wc", type: "tab", label: "Wire Check" };
const nodeAt = (
  id: string,
  type: string,
  name: string,
  x: number,
  y: number,
  wires: string[][],
): FN => ({ id, type, z: "wc", name, x, y, wires });

const shots: { name: string; flow: FN[] }[] = [
  {
    // Fan-in: one reader, a green arm, a red arm (missing a required field), and
    // an untyped arm (yellow) — 1 error + 1 warning in the tab.
    name: "fanin",
    flow: [
      tab,
      nodeAt("full", "wc-full", "order + customer", 150, 110, [["inv"]]),
      nodeAt("src", "wc-source", "order", 150, 210, [["inv"]]),
      nodeAt("unt", "wc-untyped", "untyped source", 150, 310, [["inv"]]),
      nodeAt("inv", "wc-invoice", "invoice", 540, 210, []),
    ],
  },
  {
    // Junction: order → junction → { ship, invoice }. `ship` reads order (green);
    // `invoice` also needs customer (red). The checker splices the junction out
    // and checks each real endpoint through it; the incoming wire reds too
    // (whole-path). Shows how the isolate behaves across a junction.
    name: "junction",
    flow: [
      tab,
      nodeAt("src", "wc-source", "order", 150, 160, [["j"]]),
      { id: "j", type: "junction", z: "wc", x: 380, y: 160, wires: [["shp", "inv"]] },
      nodeAt("shp", "wc-ship", "ship", 560, 90, []),
      nodeAt("inv", "wc-invoice", "invoice", 560, 240, []),
    ],
  },
  {
    // Mixed junction: two sources fan INTO one junction, out to `invoice`.
    //   order (typed {order}) → j → invoice  → RED (invoice also needs customer)
    //   untyped source (any)  → j → invoice  → YELLOW (unchecked boundary)
    // Both connections share the `j → invoice` hop, so isolating each shows its
    // own route in its own colour, and "highlight all" paints red + yellow at once
    // (error wins on the shared hop).
    name: "junction-mixed",
    flow: [
      tab,
      nodeAt("src", "wc-source", "order", 150, 110, [["j"]]),
      nodeAt("unt", "wc-untyped", "untyped source", 150, 240, [["j"]]),
      { id: "j", type: "junction", z: "wc", x: 400, y: 175, wires: [["inv"]] },
      nodeAt("inv", "wc-invoice", "invoice", 620, 175, []),
    ],
  },
];

const env = new NodeRedTestEnvironment({
  projectDir: FIXTURE,
  packageName: "wire-check",
  clientName: "WireCheckNodes",
  port: PORT,
  settingsFile: "node-red.settings.ts",
});

const port = await env.setup();
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
const editor = new NodeRedEditor(page, port, { screenshotDir: OUT });

try {
  await editor.open();
  for (const shot of shots) {
    await editor.deployFlow(shot.flow);
    // Nothing is painted on load anymore — wait for the tab to list the report,
    // then open it. The canvas stays clean until we toggle a highlight below.
    await page.waitForSelector(".nrg-wc-panel .nrg-wc-entry", {
      state: "attached",
      timeout: 20_000,
    });
    await page.waitForTimeout(600);
    await page.evaluate(() =>
      document
        .querySelectorAll(".red-ui-notification, .red-ui-notifications")
        .forEach((n) => n.remove()),
    );

    await page.evaluate(() => {
      (
        globalThis as unknown as { RED: { sidebar: { show(id: string): void } } }
      ).RED.sidebar.show("nrg-wire-check");
    });
    await page.waitForSelector(".nrg-wc-panel .nrg-wc-entry", {
      state: "visible",
      timeout: 10_000,
    });
    await page.waitForTimeout(300);

    const tabPanel = await page.$(".nrg-wc-panel");
    if (tabPanel) {
      await tabPanel.screenshot({
        path: path.join(OUT, `${shot.name}-tab.png`),
      });
    }

    // Toggle the error row's highlight → isolate just that connection (red).
    if (await page.$(".nrg-wc-entry.is-error .nrg-wc-toggle")) {
      await page.click(".nrg-wc-entry.is-error .nrg-wc-toggle");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${shot.name}-focus.png`) });
    }

    // Toggle the warning row's highlight → isolate just that connection (yellow).
    if (await page.$(".nrg-wc-entry.is-warn .nrg-wc-toggle")) {
      await page.click(".nrg-wc-entry.is-warn .nrg-wc-toggle");
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, `${shot.name}-warn.png`) });
    }

    // "Highlight all" → paint every failing (red) + warned (yellow) wire at once.
    await page.click(".nrg-wc-highlight-all");
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${shot.name}-all.png`) });

    // eslint-disable-next-line no-console
    console.log(`✓ ${shot.name}`);
  }
} finally {
  await browser.close();
  await env.teardown();
}
