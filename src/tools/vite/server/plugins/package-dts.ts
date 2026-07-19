import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { Extractor, ExtractorConfig } from "@microsoft/api-extractor";
import { logger } from "../../logger";
import {
  collectTsFiles,
  resolveConsumerCompilerOptions,
} from "./node-type-info";
import type { NodeTypeInfo } from "./node-type-info";

/**
 * Generate a package's `index.d.ts` with the STANDARD toolchain — TypeScript's own
 * declaration emit rolled up by API Extractor — rather than a hand-rolled type
 * printer. Faithful by construction: `tsc` renders the types, so every construct is
 * exactly what the compiler produces; external `node_modules` types stay
 * EXTERNALIZED as imports, and only the package's OWN types are inlined.
 *
 * Pipeline (mirrors the validated CLI chain):
 *  1. write a BARREL that re-exports every discovered node class + a precisely-typed
 *     `{ nodes: [...] }` default. This preserves auto-export — a node file the dev
 *     forgot to list in `index.ts` is still surfaced — and yields a real tuple
 *     (`[typeof A, typeof B]`), not `tsc`'s widened `(A | B)[]`.
 *  2. `tsc` emits declarations for the barrel + server/shared source into a temp
 *     dir, resolving the consumer's own compiler options.
 *  3. API Extractor rolls the emitted `.d.ts` TREE up from the barrel into one
 *     self-contained file (locals inlined, externals externalized, the `@/schemas`
 *     alias resolved), written to `<outDir>/<entry>.d.ts`.
 *
 * Fails OPEN: any failure logs a warning and leaves the package without generated
 * types rather than breaking the build.
 */
function generatePackageDts(
  infos: NodeTypeInfo[],
  srcDir: string,
  outDir: string,
  entryNames: string[],
): void {
  const classNodes = infos.filter((n) => n.className && n.sourceFile);
  if (!classNodes.length || !entryNames.length) return;

  // The server srcDir is `<root>/src/server`; shared schemas live at
  // `<root>/src/shared` (the `@/schemas` alias target build.ts wires for Vite).
  const projectRoot = path.resolve(srcDir, "../..");
  const sharedDir = path.resolve(srcDir, "../shared");
  const barrelPath = path.join(projectRoot, ".nrg-dts-barrel.ts");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nrg-dts-"));
  const dtsDir = path.join(tmp, "dts");

  try {
    // (1) barrel — value imports (for the `typeof` tuple) + re-exports + default.
    const names = classNodes.map((n) => n.className!);
    const barrel = [
      ...classNodes.map((n) => {
        const rel =
          "./" +
          path
            .relative(projectRoot, n.sourceFile!)
            .replace(/\.ts$/, "")
            .split(path.sep)
            .join("/");
        return `import ${n.className} from ${JSON.stringify(rel)};`;
      }),
      `export { ${names.join(", ")} };`,
      `declare const _default: { nodes: [${names
        .map((n) => `typeof ${n}`)
        .join(", ")}] };`,
      `export default _default;`,
      "",
    ].join("\n");
    fs.writeFileSync(barrelPath, barrel);

    // (2) tsc declaration emit → dtsDir, mirroring `src/**` structure under it.
    const base = resolveConsumerCompilerOptions(projectRoot);
    const options: ts.CompilerOptions = {
      ...base,
      declaration: true,
      emitDeclarationOnly: true,
      noEmit: false,
      noEmitOnError: false,
      skipLibCheck: true,
      outDir: dtsDir,
      rootDir: projectRoot,
    };
    const roots = [
      barrelPath,
      ...collectTsFiles(srcDir),
      ...(fs.existsSync(sharedDir) ? collectTsFiles(sharedDir) : []),
    ];
    ts.createProgram(roots, options).emit();

    const barrelDts = path.join(dtsDir, ".nrg-dts-barrel.d.ts");
    if (!fs.existsSync(barrelDts)) {
      throw new Error("declaration emit produced no barrel .d.ts");
    }

    // (3) API Extractor over the emitted .d.ts tree. The `@/schemas` alias is
    // remapped to the EMITTED schemas so the rollup resolves it (then inlines it).
    const dtsTsconfig = path.join(tmp, "tsconfig.dts.json");
    fs.writeFileSync(
      dtsTsconfig,
      JSON.stringify({
        compilerOptions: {
          moduleResolution: "bundler",
          module: "esnext",
          target: "es2022",
          skipLibCheck: true,
          baseUrl: ".",
          paths: {
            "@/schemas/*": [
              path
                .join(dtsDir, "src/shared/schemas", "*")
                .split(path.sep)
                .join("/"),
            ],
          },
        },
        include: [path.join(dtsDir, "**/*.d.ts").split(path.sep).join("/")],
      }),
    );

    const rolled = path.join(tmp, "index.d.ts");
    const extractorConfig = ExtractorConfig.prepare({
      configObjectFullPath: path.join(tmp, "api-extractor.json"),
      packageJsonFullPath: path.join(projectRoot, "package.json"),
      configObject: {
        projectFolder: projectRoot,
        mainEntryPointFilePath: barrelDts,
        compiler: { tsconfigFilePath: dtsTsconfig },
        dtsRollup: { enabled: true, untrimmedFilePath: rolled },
        apiReport: { enabled: false },
        docModel: { enabled: false },
        tsdocMetadata: { enabled: false },
      },
    });
    // localBuild: warnings (forgotten-export/missing-release-tag from the barrel's
    // internal `_default` helper types) don't fail the run.
    Extractor.invoke(extractorConfig, {
      localBuild: true,
      showVerboseMessages: false,
    });
    if (!fs.existsSync(rolled)) {
      throw new Error("API Extractor produced no rollup");
    }

    // (4) place the single rolled surface at each entry name.
    const content = fs.readFileSync(rolled, "utf-8");
    for (const name of entryNames) {
      fs.writeFileSync(path.join(outDir, `${name}.d.ts`), content);
    }
    logger.info(
      `✓ Generated types for ${classNodes.length} node(s) → ${entryNames
        .map((n) => `${n}.d.ts`)
        .join(", ")}`,
    );
  } catch (err) {
    logger.warn(
      `type generation skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(barrelPath, { force: true });
  }
}

export { generatePackageDts };
