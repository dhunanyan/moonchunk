import { MoonChunkError } from '../errors';
import { NumericType, NumericValue, RuntimeType } from '../types';

export function isNumericValue(value: unknown): value is NumericValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __kind?: string }).__kind === 'numeric'
  );
}

export function makeNumeric(value: number, numType: NumericType): NumericValue {
  if (numType === 'int') {
    return { __kind: 'numeric', numType, value: Math.trunc(value) };
  }
  return { __kind: 'numeric', numType, value };
}

function numericRank(numType: NumericType): number {
  if (numType === 'int') return 1;
  if (numType === 'float') return 2;
  return 3;
}

export function promoteNumericType(a: NumericType, b: NumericType): NumericType {
  return numericRank(a) >= numericRank(b) ? a : b;
}

export function inferType(value: unknown): RuntimeType {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (isNumericValue(value)) return value.numType;
  if (
    typeof value === 'object' &&
    value !== null &&
    (value as { __kind?: string; castType?: string }).__kind === 'cast_box' &&
    ((value as { castType?: string }).castType === 'unknown' ||
      (value as { castType?: string }).castType === 'any')
  ) {
    return (value as { castType: 'unknown' | 'any' }).castType;
  }
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'object') return 'object';
  return 'unknown';
}

export function isAssignable(declaredType: string, inferredType: string): boolean {
  if (declaredType === 'dict') return inferredType === 'object';
  if (declaredType === 'any' || declaredType === 'unknown') return true;
  if (inferredType === 'any') return true;
  if (declaredType === inferredType) return true;
  if (declaredType === 'number' && (inferredType === 'int' || inferredType === 'float' || inferredType === 'double')) return true;
  if (declaredType === 'object' && inferredType === 'array') return true;
  if (declaredType === 'void' && inferredType === 'undefined') return true;
  if (declaredType === 'undefined' && inferredType === 'void') return true;
  if (declaredType === 'void') return inferredType === 'void';
  if (declaredType === 'double' && (inferredType === 'int' || inferredType === 'float')) return true;
  if (declaredType === 'float' && inferredType === 'int') return true;
  return false;
}

export function coerceToNumeric(value: unknown, line: number): NumericValue {
  if (isNumericValue(value)) return value;
  if (typeof value === 'number') {
    return makeNumeric(value, Number.isInteger(value) ? 'int' : 'double');
  }
  throw new MoonChunkError(`Expected numeric value, got ${inferType(value)}.`, line, 1);
}

export function stringifyValue(value: unknown): string {
  if (isNumericValue(value)) {
    if (value.numType === 'int') return String(Math.trunc(value.value));
    if (Number.isInteger(value.value)) return value.value.toFixed(1);
    return String(value.value);
  }
  if (value === null || value === undefined) return '';
  return String(value);
}

export function normalizeJsonNumbers(value: unknown): unknown {
  if (typeof value === 'number') {
    return makeNumeric(value, Number.isInteger(value) ? 'int' : 'double');
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonNumbers(item));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeJsonNumbers(v);
    }
    return out;
  }
  return value;
}
