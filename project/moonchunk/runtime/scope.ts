import { MoonChunkError } from '../errors';
import { inferType, isAssignable } from './values';

export class Scope {
  parent: Scope | null;
  values: Map<string, unknown>;
  declaredTypes: Map<string, string>;

  constructor(parent: Scope | null = null) {
    this.parent = parent;
    this.values = new Map();
    this.declaredTypes = new Map();
  }

  set(name: string, value: unknown): void {
    this.values.set(name, value);
  }

  declare(name: string, value: unknown, declaredType: string | null, line: number): void {
    if (this.values.has(name)) {
      throw new MoonChunkError(`Variable redeclaration in the same scope: ${name}`, line, 1);
    }

    if (declaredType) {
      const actual = inferType(value);
      if (!isAssignable(declaredType, actual)) {
        throw new MoonChunkError(
          `Type mismatch for ${name}: declared ${declaredType}, got ${actual}.`,
          line,
          1
        );
      }
      this.declaredTypes.set(name, declaredType);
    }

    this.values.set(name, value);
  }

  get(name: string): unknown {
    if (this.values.has(name)) return this.values.get(name);
    if (this.parent) return this.parent.get(name);
    return undefined;
  }

  assign(name: string, value: unknown, line: number): void {
    if (this.values.has(name)) {
      this.values.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value, line);
      return;
    }
    throw new MoonChunkError(`Unknown variable: ${name}`, line, 1);
  }

  derive(): Scope {
    return new Scope(this);
  }
}
