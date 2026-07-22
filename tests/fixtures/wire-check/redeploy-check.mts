/**
 * Re-deploy check: after a deploy whose type diagnostics CHANGE, the tab must
 * FULLY replace its list — never concatenate old errors with new ones.
 *   cd <repo root> && npx tsx tests/fixtures/wire-check/redeploy-check.mts
 * Deploys flow A (2 errors), then flow B (1 DIFFERENT error), and reads the tab's
 * entry labels after each. Pass = after B the tab shows ONLY B's error.
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
const PORT = 1885;

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

// Flow A: order feeds TWO invoices → 2 errors (each missing customer).
const flowA: FN[] = [
  tab,
  nodeAt("src", "wc-source", "order", 150, 120, [["invA", "invB"]]),
  nodeAt("invA", "wc-invoice", "invoiceA", 520, 80, []),
  nodeAt("invB", "wc-invoice", "invoiceB", 520, 200, []),
];
// Flow B: a DIFFERENT single error (order → invoiceC); invoiceA/B are gone.
const flowB: FN[] = [
  tab,
  nodeAt("src", "wc-source", "order", 150, 120, [["invC"]]),
  nodeAt("invC", "wc-invoice", "invoiceC", 520, 120, []),
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

const readLabels = (): Promise<string[]> =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll(".nrg-wc-panel .nrg-wc-label")).map(
      (e) => (e.textContent ?? "").trim(),
    ),
  );

try {
  await editor.open();

  await editor.deployFlow(flowA);
  await page.waitForSelector(".nrg-wc-panel .nrg-wc-entry", {
    state: "attached",
    timeout: 20_000,
  });
  await page.evaluate(() => {
    (
      globalThis as unknown as { RED: { sidebar: { show(id: string): void } } }
    ).RED.sidebar.show("nrg-wire-check");
  });
  await page.waitForTimeout(800);
  const afterA = await readLabels();
  await page.screenshot({ path: path.join(OUT, "redeploy-A.png") });

  // Re-deploy the DIFFERENT flow. Wait until the tab actually reflects B (its
  // error mentions invoiceC), so we're not reading the stale A render.
  await editor.deployFlow(flowB);
  await page.waitForFunction(
    () => {
      const labels = Array.from(
        document.querySelectorAll(".nrg-wc-panel .nrg-wc-label"),
      ).map((e) => e.textContent ?? "");
      return labels.length === 1 && labels[0].includes("invoiceC");
    },
    { timeout: 20_000 },
  );
  await page.waitForTimeout(400);
  const afterB = await readLabels();
  await page.screenshot({ path: path.join(OUT, "redeploy-B.png") });

  const stale = afterB.filter((l) => l.includes("invoiceA") || l.includes("invoiceB"));
  const pass = afterB.length === 1 && stale.length === 0;
  // eslint-disable-next-line no-console
  console.log("after A:", afterA);
  // eslint-disable-next-line no-console
  console.log("after B:", afterB);
  // eslint-disable-next-line no-console
  console.log(
    pass
      ? "✓ PASS — tab fully replaced (no stale A errors concatenated)"
      : `✗ FAIL — stale entries leaked: ${JSON.stringify(stale)} (total ${afterB.length})`,
  );
} finally {
  await browser.close();
  await env.teardown();
}
