import { MoonChunkError } from "../errors";
import { inferType, isAssignable } from "./values";

export const UNINITIALIZED = Symbol("moonchunk_uninitialized");

export function isUninitialized(value: unknown): boolean {
  return value === UNINITIALIZED;
}

export class Scope {
  parent: Scope | null;
  values: Map<string, unknown>;
  declaredTypes: Map<string, string>;
  mutability: Map<string, boolean>;
  isBoundary: boolean;
  forbidParentRedeclare: boolean;

  constructor(
    parent: Scope | null = null,
    isBoundary = false,
    forbidParentRedeclare = false,
  ) {
    this.parent = parent;
    this.values = new Map();
    this.declaredTypes = new Map();
    this.mutability = new Map();
    this.isBoundary = isBoundary;
    this.forbidParentRedeclare = forbidParentRedeclare;
  }

  set(name: string, value: unknown): void {
    this.values.set(name, value);
    this.mutability.set(name, true);
  }

  private static editDistance(a: string, b: string): number {
    const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
      Array<number>(b.length + 1).fill(0),
    );
    for (let i = 0; i <= a.length; i += 1) dp[i][0] = i;
    for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
    for (let i = 1; i <= a.length; i += 1) {
      for (let j = 1; j <= b.length; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + cost,
        );
      }
    }
    return dp[a.length][b.length];
  }

  getVisibleNames(stopAtBoundary = false): string[] {
    const seen = new Set<string>();
    for (const key of this.values.keys()) seen.add(key);
    let cursor: Scope | null = this.parent;
    while (cursor) {
      for (const key of cursor.values.keys()) seen.add(key);
      if (stopAtBoundary && cursor.isBoundary) break;
      cursor = cursor.parent;
    }
    return [...seen];
  }

  suggestClosestName(target: string): string | null {
    const names = this.getVisibleNames();
    let bestName: string | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const candidate of names) {
      const score = Scope.editDistance(target, candidate);
      if (score < bestScore) {
        bestScore = score;
        bestName = candidate;
      }
    }
    if (!bestName) return null;
    const threshold = Math.max(2, Math.floor(bestName.length * 0.4));
    return bestScore <= threshold ? bestName : null;
  }

  declare(
    name: string,
    value: unknown,
    declaredType: string | null,
    line: number,
    mutable = true,
  ): void {
    if (this.values.has(name)) {
      throw new MoonChunkError(
        `Variable redeclaration in the same scope: ${name}`,
        line,
        1,
      );
    }
    if (this.forbidParentRedeclare) {
      let cursor: Scope | null = this.parent;
      while (cursor) {
        if (cursor.values.has(name)) {
          throw new MoonChunkError(
            `Variable redeclaration in parent scope: ${name}`,
            line,
            1,
          );
        }
        if (cursor.isBoundary) break;
        cursor = cursor.parent;
      }
    }

    if (declaredType) {
      if (isUninitialized(value)) {
        this.declaredTypes.set(name, declaredType);
        this.values.set(name, value);
        this.mutability.set(name, mutable);
        return;
      }
      const actual = inferType(value);
      if (!isAssignable(declaredType, actual)) {
        throw new MoonChunkError(
          `Type mismatch for ${name}: declared ${declaredType}, got ${actual}.`,
          line,
          1,
        );
      }
      this.declaredTypes.set(name, declaredType);
    } else if (this.declaredTypes.has(name)) {
      this.declaredTypes.delete(name);
    }

    this.values.set(name, value);
    this.mutability.set(name, mutable);
  }

  get(name: string): unknown {
    if (this.values.has(name)) return this.values.get(name);
    if (this.parent) return this.parent.get(name);
    return undefined;
  }

  getAtParentDepth(depth: number, name: string): unknown {
    if (depth <= 0) return this.values.get(name);
    let cursor: Scope | null = this.parent;
    for (let i = 1; i < depth; i += 1) {
      cursor = cursor?.parent ?? null;
      if (!cursor) return undefined;
    }
    if (!cursor) return undefined;
    return cursor.values.has(name) ? cursor.values.get(name) : undefined;
  }

  assign(name: string, value: unknown, line: number): void {
    if (this.values.has(name)) {
      if (this.mutability.get(name) === false) {
        throw new MoonChunkError(
          `Cannot reassign const variable: ${name}`,
          line,
          1,
        );
      }

      const declaredType = this.declaredTypes.get(name);
      if (declaredType) {
        const actual = inferType(value);
        if (!isAssignable(declaredType, actual)) {
          throw new MoonChunkError(
            `Type mismatch for ${name}: declared ${declaredType}, got ${actual}.`,
            line,
            1,
          );
        }
      }

      this.values.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.assign(name, value, line);
      return;
    }
    const suggestion = this.suggestClosestName(name);
    const hint = suggestion ? ` Did you mean '${suggestion}'?` : "";
    throw new MoonChunkError(`Unknown variable: ${name}.${hint}`, line, 1);
  }

  assignAtParentDepth(
    depth: number,
    name: string,
    value: unknown,
    line: number,
  ): void {
    if (depth <= 0) {
      this.assign(name, value, line);
      return;
    }
    let cursor: Scope | null = this.parent;
    for (let i = 1; i < depth; i += 1) {
      cursor = cursor?.parent ?? null;
    }
    if (!cursor || !cursor.values.has(name)) {
      throw new MoonChunkError(
        `Unknown variable at parent depth ${depth}: ${name}.`,
        line,
        1,
      );
    }
    if (cursor.mutability.get(name) === false) {
      throw new MoonChunkError(
        `Cannot reassign const variable: ${name}`,
        line,
        1,
      );
    }
    const declaredType = cursor.declaredTypes.get(name);
    if (declaredType) {
      const actual = inferType(value);
      if (!isAssignable(declaredType, actual)) {
        throw new MoonChunkError(
          `Type mismatch for ${name}: declared ${declaredType}, got ${actual}.`,
          line,
          1,
        );
      }
    }
    cursor.values.set(name, value);
  }

  derive(): Scope {
    return new Scope(this);
  }

  deriveStrict(): Scope {
    return new Scope(this, false, true);
  }

  deriveBoundary(): Scope {
    return new Scope(this, true);
  }
}
