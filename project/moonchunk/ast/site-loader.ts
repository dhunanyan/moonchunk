import { MoonChunkError } from '../errors';
import { parseProgramWithAntlr } from '../parser/parse';

export function parseSiteOrFragment(code: string): unknown {
  const firstNonEmpty = code
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  const wrapped = firstNonEmpty && firstNonEmpty.startsWith('site ')
    ? code
    : `site "__import__" {\n${code}\n}`;

  const parsed = parseProgramWithAntlr(wrapped);
  if (parsed.diagnostics.length > 0) {
    const d = parsed.diagnostics[0];
    throw new MoonChunkError(d.message, d.line, d.column);
  }
  return parsed.ast;
}
