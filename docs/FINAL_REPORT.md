# MoonChunk - Final Topics Coverage

## Implemented mandatory topics

### 1) Variable scopes (`scope`)

- Standalone block scopes are supported: `{ ... }` (with optional trailing `;`).
- Parent-scope access is supported via:
  - `parent::name`
  - `parent::parent::name`
- Current scope rules:
  - Same-scope redeclaration is forbidden.
  - Redeclaration in `if/for/while` child scopes is forbidden (strict child scope).
  - Redeclaration in explicit `{ ... }` blocks is allowed (shadowing).
  - Function boundary scopes are isolated.

### 2) Promotions and conversions

- Numeric promotion works (e.g. `float a = 1;`).
- `as` casting is supported.
- C-style casting is supported:
  - `let a: int = (int)2.5;`

### 3) Improved diagnostics

- Unknown variable messages now include typo suggestions when available:
  - `Did you mean 'counter'?`
- Parent-depth errors are explicit for `parent::...` lookups.
- Existing normalized parser/runtime error messages remain active.

### 4) Language tests

- Added scenario:
  - `examples/scenarios/26-final-mandatory/site.mncnk`
- Added error-case scenario:
  - `examples/scenarios/26-final-mandatory/error-typo-suggestion.mncnk`

## Notes

- "Uninitialized variable" diagnostics are not applicable with current grammar because `let/const/global` declarations require initialization (`= expression`) by syntax.
- Optional final topics (REPL, stdlib expansion, advanced data structures beyond current arrays/objects) are out of this final mandatory implementation pass.
