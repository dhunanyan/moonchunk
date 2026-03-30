import { CharStreams, CommonTokenStream } from 'antlr4ts';
import { MoonChunkLexer } from '../../.antlr/MoonChunkLexer';
import { MoonChunkParser } from '../../.antlr/MoonChunkParser';
import { AstBuilder } from './ast-builder';
import { SyntaxCollector } from './syntax-collector';
import { Diagnostic } from '../types';

export function parseProgramWithAntlr(code: string): { ast: unknown; diagnostics: Diagnostic[] } {
  const input = CharStreams.fromString(code);
  const lexer = new MoonChunkLexer(input);
  const tokens = new CommonTokenStream(lexer);
  const parser = new MoonChunkParser(tokens);

  const syntax = new SyntaxCollector();
  lexer.removeErrorListeners();
  parser.removeErrorListeners();
  lexer.addErrorListener(syntax);
  parser.addErrorListener(syntax);

  const tree = parser.program();

  if (syntax.diagnostics.length > 0) {
    return { ast: null, diagnostics: syntax.diagnostics };
  }

  const builder = new AstBuilder(tokens, code);
  const ast = builder.visit(tree);
  return { ast, diagnostics: [] };
}
