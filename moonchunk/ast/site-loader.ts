import { MoonChunkError } from "../errors";
import { parseProgramWithAntlr } from "../parser/parse";
import { AstProgramNode } from "../types";

export function parseProgramOrFragment(code: string): AstProgramNode {
  const firstNonEmpty = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  const isTopLevelProgram = Boolean(
    firstNonEmpty &&
      (firstNonEmpty.startsWith("chunk ") ||
        firstNonEmpty.startsWith("export chunk ") ||
        firstNonEmpty.startsWith("import ") ||
        /^moon\s*\(/.test(firstNonEmpty)),
  );

  const wrapped = isTopLevelProgram
    ? code
    : `chunk "__import__" {\n${code}\n};`;

  const parsed = parseProgramWithAntlr(wrapped);
  if (parsed.diagnostics.length > 0 || !parsed.ast) {
    const d = parsed.diagnostics[0] ?? {
      message: "Unknown parse error.",
      line: 1,
      column: 1,
    };
    throw new MoonChunkError(d.message, d.line, d.column);
  }

  return parsed.ast;
}
