export function resolvePathValue(target: unknown, chain: string[]): unknown {
  let current: unknown = target;
  for (const segment of chain) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
