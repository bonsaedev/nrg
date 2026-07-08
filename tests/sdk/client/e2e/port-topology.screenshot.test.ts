import { describe, test, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { NodeRedEditor } from "@/sdk/test/client/e2e";
import { FIXTURE_FLOW } from "./global-setup";

// Not an assertion test — it drives the real Node-RED editor to capture docs
// screenshots proving the port-topology contract: `never` → no port, `any` /
// `unknown` → one untyped port, a named-Port record → one port per name.
//
// OPT-IN ONLY (run with NRG_SCREENSHOTS=1). It shares the single Node-RED
// instance with the other e2e files, and its `beforeAll` does a FULL destructive
// `deployFlow` that replaces the fixture flow (n1..n5) with its own demo nodes.
// Left in the default suite it races those files (their nodes vanish mid-test and
// the editor's full-shade swallows clicks), so it is skipped unless explicitly
// regenerating docs — and should be run on its own when it is.
const GENERATE = Boolean(process.env.NRG_SCREENSHOTS);
const PORT = Number(process.env.NODE_RED_PORT);
const OUT = "/tmp/nrg-port-screens";

const NODES = [
  {
    id: "src",
    type: "ports-source",
    name: "source · Input = never → 0 in, 1 out",
    expect: "0 in · 1 out",
    y: 100,
    wires: [[]],
  },
  {
    id: "trg",
    type: "ports-trigger",
    name: "trigger · Input = any → 1 in, 1 out",
    expect: "1 in · 1 out",
    y: 200,
    wires: [[]],
  },
  {
    id: "rte",
    type: "ports-route",
    name: "route · named Output → 1 in, 2 out",
    expect: "1 in · 2 out",
    y: 300,
    wires: [[], []],
  },
  {
    id: "snk",
    type: "ports-sink",
    name: "sink · Output = never → 1 in, 0 out",
    expect: "1 in · 0 out",
    y: 400,
    wires: [],
  },
];

const FLOW: Record<string, unknown>[] = [
  { id: "tabP", type: "tab", label: "Port Topology" },
  ...NODES.map((n) => ({
    id: n.id,
    type: n.type,
    z: "tabP",
    name: n.name,
    x: 320,
    y: n.y,
    wires: n.wires,
  })),
];

describe.skipIf(!GENERATE)("port topology screenshots", () => {
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

  test("captures the canvas and each node with its ports", async () => {
    await editor.screenshot("00-port-topology-canvas");

    for (const n of NODES) {
      const info = await page.evaluate((id) => {
        const groups = Array.from(
          document.querySelectorAll(".red-ui-flow-node-group"),
        );
        const g = groups.find(
          (el) =>
            (el as unknown as { __data__?: { id: string } }).__data__?.id ===
            id,
        );
        if (!g) return null;
        const nodeEl = g.querySelector(".red-ui-flow-node") ?? g;
        const r = nodeEl.getBoundingClientRect();
        return {
          ins: g.querySelectorAll(".red-ui-flow-port-input").length,
          outs: g.querySelectorAll(".red-ui-flow-port-output").length,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
        };
      }, n.id);

      // eslint-disable-next-line no-console
      console.log(
        `${n.type.padEnd(14)} rendered ${info?.ins} in · ${info?.outs} out  (expected ${n.expect})`,
      );

      if (info) {
        const pad = 28;
        await page.screenshot({
          path: `${OUT}/${n.type}.png`,
          clip: {
            x: Math.max(0, info.x - pad),
            y: Math.max(0, info.y - pad),
            width: info.w + pad * 2,
            height: info.h + pad * 2,
          },
        });
      }
    }
  }, 60_000);
});
