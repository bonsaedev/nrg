import path from "node:path";
import ts from "typescript";
import { resolveConsumerCompilerOptions } from "../plugins/node-type-info";

interface ProgramDiagnostic {
  /** 1-based line in the checked program text. */
  line: number;
  message: string;
  /** The TS error code (e.g. 2345), for callers that filter specific ones. */
  code: number;
}

/**
 * Type-check a compiled flow program IN MEMORY — no files written, no tsc
 * subprocess. A virtual host serves the program text; lib files resolve from
 * the installed `typescript` as usual.
 *
 * When `srcDir` (the consumer's server source) is given, the synth file is
 * ROOTED INSIDE that project and compiled with the consumer's OWN resolution
 * options (tsconfig `baseUrl`/`paths`/`moduleResolution`/`lib`) — so an extracted
 * output type that references an external package (`import("jsforce").Record`,
 * etc.) resolves against the consumer's `node_modules`, exactly as it does at
 * build time. Without this, every consumer whose node ports carry
 * externally-typed data would fail to type-check. `noUnusedLocals`/
 * `noUnusedParameters` are forced OFF — the synth intentionally declares leaf
 * consts that are never read — and `types: []` keeps @types scanning out of the
 * hot path.
 */
function checkProgram(code: string, srcDir?: string): ProgramDiagnostic[] {
  const base: ts.CompilerOptions = srcDir
    ? resolveConsumerCompilerOptions(path.resolve(srcDir))
    : {
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      };
  const options: ts.CompilerOptions = {
    ...base,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    types: [],
  };

  // Root the virtual file inside the consumer project so relative node_modules
  // resolution walks up to the consumer's dependencies.
  const file = srcDir
    ? path.join(path.resolve(srcDir), "__nrg_wire_check__.ts")
    : "nrg-flow-check.ts";

  const host = ts.createCompilerHost(options, true);
  const sourceFile = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.ESNext,
    true,
  );
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) =>
    name === file ? sourceFile : getSourceFile(name, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (f) => f === file || fileExists(f);

  const program = ts.createProgram([file], options, host);
  const diagnostics = [
    ...program.getSyntacticDiagnostics(sourceFile),
    ...program.getSemanticDiagnostics(sourceFile),
  ];
  return diagnostics.map((d) => {
    const line =
      d.file && d.start !== undefined
        ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
        : 0;
    return {
      line,
      code: d.code,
      message: ts.flattenDiagnosticMessageText(d.messageText, " "),
    };
  });
}

export { checkProgram };
export type { ProgramDiagnostic };
