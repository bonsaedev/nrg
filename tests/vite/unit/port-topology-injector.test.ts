import { describe, it, expect } from "vitest";
import path from "path";
import { parseAst } from "vite";
import { portTopologyInjector } from "@/tools/vite/server/plugins/port-topology-injector";

const FILE = path.resolve("/nodes/http.ts");
const TOPO = { inputs: 1 as const, outputs: 2, outputNames: ["ok", "err"] };
const STAMP = `.__nrgPorts = ${JSON.stringify(TOPO)}`;

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
    expect(out?.code).toContain(`Http${STAMP}`);
  });

  it("stamps a named `export default class X`", () => {
    const out = run(`export default class Http extends Base {}`);
    expect(out?.code).toContain(`Http${STAMP}`);
  });

  it("stamps a `var d = defineIONode(...); export { d as default }` (functional form)", () => {
    const out = run(
      `var stdin_default = defineIONode({ type: "http" });\nexport { stdin_default as default };`,
    );
    expect(out?.code).toContain(`stdin_default${STAMP}`);
  });

  it("captures a bare `export default <expr>` into a const, then stamps + re-exports", () => {
    const out = run(`export default defineIONode({ type: "http" });`);
    expect(out?.code).toContain(
      `const __nrgDefault = defineIONode({ type: "http" })`,
    );
    expect(out?.code).toContain(`__nrgDefault${STAMP}`);
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
