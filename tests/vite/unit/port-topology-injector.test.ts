import { describe, it, expect } from "vitest";
import path from "path";
import { parseAst } from "vite";
import { portTopologyInjector } from "@/tools/vite/server/plugins/port-topology-injector";

const FILE = path.resolve("/nodes/http.ts");
const TOPO = { inputs: 1 as const, outputs: 2, outputNames: ["ok", "err"] };
const stamp = (local: string) =>
  `Object.defineProperty(${local}, Symbol.for("nrg.ports"), { value: ${JSON.stringify(TOPO)}, writable: false, configurable: false })`;

function run(code: string, id: string = FILE): { code: string } | undefined {
  const plugin = portTopologyInjector(new Map([[FILE, TOPO]]));
  const transform = plugin.transform as (
    this: { parse: typeof parseAst },
    code: string,
    id: string,
  ) => { code: string } | undefined;
  return transform.call({ parse: parseAst }, code, id);
}

describe("portTopologyInjector", () => {
  it("stamps __nrgPorts on the esbuild-normalized `export { X as default }` shape", () => {
    const out = run(`class Http extends Base {}\nexport { Http as default };`);
    expect(out?.code).toContain(stamp("Http"));
  });

  it("stamps a named `export default class X`", () => {
    const out = run(`export default class Http extends Base {}`);
    expect(out?.code).toContain(stamp("Http"));
  });

  it("stamps a `var d = class {}; export { d as default }` (esbuild var form)", () => {
    const out = run(
      `var stdin_default = class extends Base {};\nexport { stdin_default as default };`,
    );
    expect(out?.code).toContain(stamp("stdin_default"));
  });

  it("captures a bare `export default <expr>` into a const, then stamps + re-exports", () => {
    const out = run(`export default (class extends Base {});`);
    expect(out?.code).toContain(`const __nrgDefault = class extends Base {}`);
    expect(out?.code).toContain(stamp("__nrgDefault"));
    expect(out?.code).toContain(`export { __nrgDefault as default }`);
  });

  it("leaves a module that is not a known node source untouched", () => {
    const out = run(
      `export default class Http extends Base {}`,
      "/nodes/other.ts",
    );
    expect(out).toBeUndefined();
  });

  it("is a no-op when the topology map is empty", () => {
    const plugin = portTopologyInjector(new Map());
    const transform = plugin.transform as (
      this: { parse: typeof parseAst },
      code: string,
      id: string,
    ) => { code: string } | undefined;
    expect(
      transform.call(
        { parse: parseAst },
        `export default class Http extends Base {}`,
        FILE,
      ),
    ).toBeUndefined();
  });
});
