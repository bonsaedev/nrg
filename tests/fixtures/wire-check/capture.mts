/**
 * Capture the wire-check editor screenshots for the docs.
 *
 *   cd <repo root> && npx tsx tests/fixtures/wire-check/capture.mts
 *
 * Spins up a real Node-RED with the wire-check demo nodes AND the type-check
 * plugin, deploys each demo flow, waits for the plugin to paint the canvas, and
 * writes a cropped PNG per flow into docs/public/wire-check/.
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
const OUT = path.join(REPO, "docs/public/wire-check");
const PORT = 1882;

// Link the freshly-built nrg packages + the type-check plugin into the fixture so
// the fixture build resolves `@bonsae/nrg` and the launcher auto-loads the plugin
// (run `pnpm build` in the repo root first). Keeps node_modules out of git.
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

// The plugin extracts node types from this source dir (mirrors what the vite
// dev launcher sets); the launched Node-RED child inherits it.
process.env.NRG_WIRE_CHECK_SRC = path.join(FIXTURE, "src/server");

// The served editor client is content-hashed; hand the launched runtime the
// exact hashed name it will serve (same handshake as the e2e global-setup).
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
const node = (
  id: string,
  type: string,
  name: string,
  x: number,
  wires: string[][],
): FN => ({ id, type, z: "wc", name, x, y: 120, wires });
const nodeAt = (
  id: string,
  type: string,
  name: string,
  x: number,
  y: number,
  wires: string[][],
): FN => ({ id, type, z: "wc", name, x, y, wires });

interface Shot {
  file: string;
  expect: "green" | "red" | "yellow";
  flow: FN[];
}

const shots: Shot[] = [
  {
    file: "green",
    expect: "green",
    flow: [
      tab,
      node("src", "wc-source", "order", 160, [["enr"]]),
      node("enr", "wc-enrich", "add customer", 340, [["inv"]]),
      node("inv", "wc-invoice", "invoice", 560, []),
    ],
  },
  {
    file: "red-missing",
    expect: "red",
    flow: [
      tab,
      node("src", "wc-source", "order", 160, [["inv"]]),
      node("inv", "wc-invoice", "invoice", 420, []),
    ],
  },
  {
    file: "red-conflict",
    expect: "red",
    flow: [
      tab,
      node("bad", "wc-bad-source", "order = string", 160, [["shp"]]),
      node("shp", "wc-ship", "ship", 420, []),
    ],
  },
  {
    file: "yellow-untyped",
    expect: "yellow",
    flow: [
      tab,
      node("unt", "wc-untyped", "untyped source", 160, [["inv"]]),
      node("inv", "wc-invoice", "invoice", 420, []),
    ],
  },
  {
    file: "yellow-core",
    expect: "yellow",
    flow: [
      tab,
      {
        id: "inj",
        type: "inject",
        z: "wc",
        name: "inject",
        x: 160,
        y: 120,
        wires: [["inv"]],
      },
      node("inv", "wc-invoice", "invoice", 420, []),
    ],
  },
  {
    file: "red-cleared",
    expect: "red",
    flow: [
      tab,
      node("src", "wc-source", "order", 120, [["enr"]]),
      node("enr", "wc-enrich", "add customer", 300, [["clr"]]),
      node("clr", "wc-clear", "clear customer", 500, [["inv"]]),
      node("inv", "wc-invoice", "invoice", 700, []),
    ],
  },
  {
    file: "green-cleared-optional",
    expect: "green",
    flow: [
      tab,
      node("src", "wc-source", "order", 120, [["enr"]]),
      node("enr", "wc-enrich", "add customer", 300, [["clr"]]),
      node("clr", "wc-clear", "clear customer", 500, [["aud"]]),
      node("aud", "wc-audit", "audit (optional)", 700, []),
    ],
  },
  {
    // Fan-OUT: one output, two wires — each checked on its own. `order` reaches
    // both, so `ship` (reads order) passes while `invoice` (also needs customer)
    // fails, on the same fork.
    file: "branch",
    expect: "red",
    flow: [
      tab,
      nodeAt("src", "wc-source", "order", 160, 130, [["shp", "inv"]]),
      nodeAt("shp", "wc-ship", "ship", 470, 60, []),
      nodeAt("inv", "wc-invoice", "invoice", 470, 210, []),
    ],
  },
  {
    // Fan-IN: three arms into one reader, one of each verdict. Node-RED delivers
    // each message separately, so each incoming wire is checked on its own — the
    // `wc-full` arm carries customer (green), the `wc-source` arm doesn't (red),
    // and the untyped arm can't be checked (yellow).
    file: "fan-in",
    expect: "red",
    flow: [
      tab,
      nodeAt("full", "wc-full", "order + customer", 150, 110, [["inv"]]),
      nodeAt("src", "wc-source", "order", 150, 205, [["inv"]]),
      nodeAt("unt", "wc-untyped", "untyped", 150, 300, [["inv"]]),
      nodeAt("inv", "wc-invoice", "invoice", 520, 205, []),
    ],
  },
  {
    // A JUNCTION as a BRANCH point: one wire in from `order`, then the junction
    // fans the record — unchanged — to several targets. The checker splices the
    // junction out and checks each real endpoint through it: `ship` (reads order)
    // passes, `invoice` (also needs customer) fails. The incoming wire reds too,
    // because a path running through it fails (whole-path painting).
    file: "junction",
    expect: "red",
    flow: [
      tab,
      nodeAt("src", "wc-source", "order", 150, 130, [["j"]]),
      {
        id: "j",
        type: "junction",
        z: "wc",
        x: 380,
        y: 130,
        wires: [["shp", "inv"]],
      },
      nodeAt("shp", "wc-ship", "ship", 520, 60, []),
      nodeAt("inv", "wc-invoice", "invoice", 520, 210, []),
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

    // Wait for the plugin's verdict to land + paint.
    if (shot.expect === "red") {
      // SVG link paths are "hidden" to Playwright's visibility heuristic even
      // when the red stroke renders — wait for the class in the DOM, not visible.
      await page.waitForSelector(".red-ui-flow-link-line.nrg-wire-type-error", {
        state: "attached",
        timeout: 15_000,
      });
      await page.waitForTimeout(400);
    } else if (shot.expect === "yellow") {
      await page.waitForSelector(".red-ui-flow-link-line.nrg-wire-type-warn", {
        state: "attached",
        timeout: 15_000,
      });
      await page.waitForTimeout(400);
    } else {
      // green: no red/yellow class ever appears — wait for the check to finish
      // (the report endpoint returns real wires) so we don't shoot a blank check.
      await page
        .waitForFunction(
          async (p) => {
            const r = await fetch(`http://localhost:${p}/nrg/type-check/flow`)
              .then((x) => x.json())
              .catch(() => null);
            return r && Array.isArray(r.wires) && r.wires.length > 0 && r.ok;
          },
          port,
          { timeout: 15_000 },
        )
        .catch(() => {});
      await page.waitForTimeout(800);
    }

    // Drop the sticky "N wire(s) failed" toast so it doesn't hang over the crop.
    await page.evaluate(() =>
      document
        .querySelectorAll(".red-ui-notification, .red-ui-notifications")
        .forEach((n) => n.remove()),
    );

    // Crop tightly to the flow nodes + their wires.
    const box = await page.evaluate(() => {
      const groups = Array.from(
        document.querySelectorAll(".red-ui-flow-node-group"),
      );
      if (!groups.length) return null;
      let x1 = Infinity,
        y1 = Infinity,
        x2 = -Infinity,
        y2 = -Infinity;
      for (const g of groups) {
        const r = g.getBoundingClientRect();
        x1 = Math.min(x1, r.left);
        y1 = Math.min(y1, r.top);
        x2 = Math.max(x2, r.right);
        y2 = Math.max(y2, r.bottom);
      }
      return { x1, y1, x2, y2 };
    });
    const pad = 44;
    const clip = box
      ? {
          x: Math.max(0, box.x1 - pad),
          y: Math.max(0, box.y1 - pad),
          width: box.x2 - box.x1 + pad * 2,
          height: box.y2 - box.y1 + pad * 2,
        }
      : undefined;
    await page.screenshot({ path: path.join(OUT, `${shot.file}.png`), clip });
    // eslint-disable-next-line no-console
    console.log(`✓ ${shot.file}.png  (${shot.expect})`);
  }
} finally {
  await browser.close();
  await env.teardown();
}
