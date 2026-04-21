import { ANTLRErrorListener } from 'antlr4ts/ANTLRErrorListener';
import { RecognitionException } from 'antlr4ts/RecognitionException';
import { Recognizer } from 'antlr4ts/Recognizer';
import { Diagnostic } from '../types';

export class SyntaxCollector implements ANTLRErrorListener<any> {
  diagnostics: Diagnostic[] = [];

  syntaxError(
    _recognizer: Recognizer<any, any>,
    _offendingSymbol: any,
    line: number,
    charPositionInLine: number,
    msg: string,
    _e: RecognitionException | undefined
  ): void {
    this.diagnostics.push({ message: msg, line, column: charPositionInLine + 1 });
  }
}
