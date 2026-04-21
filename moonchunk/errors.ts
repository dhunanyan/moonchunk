export class MoonChunkError extends Error {
  line: number;
  column: number;

  constructor(message: string, line = 1, column = 1) {
    super(message);
    this.name = 'MoonChunkError';
    this.line = line;
    this.column = column;
  }
}
