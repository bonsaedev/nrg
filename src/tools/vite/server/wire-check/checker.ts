import ts from "typescript";

interface ProgramDiagnostic {
  /** 1-based line in the checked program text. */
  line: number;
  message: string;
}

const FILE = "nrg-flow-check.ts";

/**
 * Type-check a compiled flow program IN MEMORY — no files written, no tsc
 * subprocess. A virtual host serves the program text; lib files resolve from
 * the installed `typescript` as usual. `types: []` keeps @types scanning out
 * of the hot path.
 */
function checkProgram(code: string): ProgramDiagnostic[] {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    types: [],
  };
  const host = ts.createCompilerHost(options, true);
  const sourceFile = ts.createSourceFile(
    FILE,
    code,
    ts.ScriptTarget.ESNext,
    true,
  );
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) =>
    name === FILE ? sourceFile : getSourceFile(name, ...rest);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (f) => f === FILE || fileExists(f);

  const program = ts.createProgram([FILE], options, host);
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
      message: ts.flattenDiagnosticMessageText(d.messageText, " "),
    };
  });
}

export { checkProgram };
export type { ProgramDiagnostic };
