# Contributing

## Workflow

1. Create a feature branch.
2. Add/update tests or sample fixtures in `examples/` to cover grammar changes.
3. Keep scopes stable in `syntaxes/moonchunk.tmLanguage.json` to avoid theme regressions.
4. Update `CHANGELOG.md` for user-facing changes.

## Validation

- `npm run build`
- Launch Extension Development Host (`F5`) and verify highlighting manually.
- Validate JSON files with `jq`.

## Style

- Keep regexes explicit and documented with scope names.
- Prefer incremental grammar changes over broad rewrites.
