import * as path from 'node:path';

export function routeToOutputFile(route: string): string {
  const normalized = route.trim();
  if (normalized === '/' || normalized === '') return 'index.html';
  const withoutLeadingSlash = normalized.startsWith('/') ? normalized.slice(1) : normalized;
  if (withoutLeadingSlash.endsWith('/')) return `${withoutLeadingSlash}index.html`;
  if (!path.extname(withoutLeadingSlash)) return `${withoutLeadingSlash}.html`;
  return withoutLeadingSlash;
}
