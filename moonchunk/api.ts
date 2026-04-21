import * as fs from 'node:fs';
import * as path from 'node:path';
import { MoonChunkError } from './errors';
import { parseProgramWithAntlr } from './parser/parse';
import { runAst } from './runtime/executor';
import { AstProgramNode, ExecOptions, ExecResult } from './types';

export function executeMoonChunk(code: string, options: ExecOptions = {}): ExecResult {
  try {
    const parsed = parseProgramWithAntlr(code);
    if (parsed.diagnostics.length > 0 || !parsed.ast) {
      return { ok: false, output: [], result: null, diagnostics: parsed.diagnostics };
    }

    const runtime = runAst(parsed.ast as AstProgramNode, options);
    return {
      ok: true,
      output: runtime.output,
      result: runtime.result,
      generatedFiles: runtime.generatedFiles,
      diagnostics: [],
      ast: parsed.ast
    };
  } catch (error) {
    if (error instanceof MoonChunkError) {
      return {
        ok: false,
        output: [],
        result: null,
        diagnostics: [{ message: error.message, line: error.line, column: error.column }]
      };
    }

    return {
      ok: false,
      output: [],
      result: null,
      diagnostics: [{ message: error instanceof Error ? error.message : 'Unknown MoonChunk error.', line: 1, column: 1 }]
    };
  }
}

export function executeMoonChunkFile(filePath: string, options: ExecOptions = {}): ExecResult {
  if (!filePath.endsWith('.mncnk')) {
    return {
      ok: false,
      output: [],
      result: null,
      diagnostics: [{ message: 'MoonChunk source file must use .mncnk extension.', line: 1, column: 1 }]
    };
  }

  if (!fs.existsSync(filePath)) {
    return {
      ok: false,
      output: [],
      result: null,
      diagnostics: [{ message: `File does not exist: ${filePath}`, line: 1, column: 1 }]
    };
  }

  const code = fs.readFileSync(filePath, 'utf8');
  const cwd = options.cwd || path.dirname(path.resolve(filePath));
  return executeMoonChunk(code, { ...options, cwd });
}
