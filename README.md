<p align="center">
  <img src="https://raw.githubusercontent.com/dhunanyan/moonchunk/master/assets/logo.png" alt="MoonChunk logo" width="180" />
</p>

<h1 align="center">MoonChunk</h1>

<p align="center">
  A compact DSL and runtime for generating static HTML from <code>.mncnk</code> source files.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-2ea44f" alt="Version" />
  <img src="https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node >= 18" />
  <img src="https://img.shields.io/badge/typescript-5.x-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/antlr4ts-0.5.0--alpha.4-fb8c00" alt="ANTLR4TS" />
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT License" />
</p>

## Overview

- Book (in Polish): [MoonChunk_Book.pdf](MoonChunk_Book.pdf)
- Complete Documentation (in Polish): [MoonChunk_Complete_Docs_Polish.pdf](MoonChunk_Complete_Docs_Polish.pdf)

MoonChunk is an open-source language runtime focused on:

- describing page generation in a concise DSL (`*.mncnk`)
- parsing with ANTLR4TS
- executing language constructs (imports, scopes, loops, functions, recursion)
- generating formatted HTML output

Recommended use cases:

- small and medium static sites with reusable page fragments
- typed HTML generation from JSON-like data
- educational projects around parsers, interpreters, and DSL design
- controlled page generation where explicit execution flow matters

## Features

- Modular chunks with `import` / `@include`
- Explicit entrypoint execution via `moon(...)`
- Local and global variable model (`let`, `const`, `env { global ... }`)
- `let` declarations may be created without an initial value and must be assigned before use
- Type-aware expressions (`int`, `float`, `double`, `bool`, `string`, `number`, `array`, `dict` / `object`, `undefined`, `unknown`, `any`)
- Control flow: `if`, `for`, `while`, `break`, `continue`
- Functions (including recursive calls)
- Arrays and dictionaries with path/index access (`obj.a`, `arr[0]`)
- Scope-aware access to parent scopes via `parent::name`
- Casts with C-style syntax `(int)value`; `as` remains supported as a compatibility alias
- Builtins like `data(...)` and `print(...)`
- Internal base layout + metadata defined directly in `.mncnk`
- Friendly error diagnostics with line/column information

## Requirements

- Node.js `>=18`
- Yarn Classic (`1.x`) recommended

For end users of the language itself, the main workflow is:

- run a prepared MoonChunk runtime/package
- execute a `.mncnk` file
- inspect generated HTML in the output directory

Repository-level commands below are mostly relevant when developing MoonChunk itself.

## Installation

```bash
yarn install
```

## Quick Start

```bash
yarn build
yarn start examples/scenarios/18-recursive-function/site.mncnk
```

## Build & Run

```bash
# Full build (ANTLR generation + TypeScript compilation)
yarn build

# Start runtime
yarn start <path/to/file.mncnk>

# Debug mode
yarn start:debug <path/to/file.mncnk>

# Type checks / validation script
yarn run check

# Lint checks
yarn lint

# Auto-fix lint issues
yarn lint:fix
```

## Git Hooks (Husky)

Husky is configured for local quality gates:

- `pre-commit` -> `yarn lint` + `yarn run check`
- `pre-push` -> `yarn build`

After pulling changes, run:

```bash
yarn install
```

(`prepare` script will initialize Husky hooks automatically.)

## Quality Checks

Recommended local verification before opening a PR:

```bash
yarn lint
yarn run check
yarn build
```

Checks overview:

- `yarn lint` -> ESLint for TypeScript and scripts
- `yarn run check` -> MoonChunk self-check (build + runtime sanity check)
- `yarn build` -> grammar generation + TypeScript compilation

## Programmatic API

```ts
import { executeMoonChunk, executeMoonChunkFile } from "moonchunk";

const fromFile = executeMoonChunkFile(
  "examples/scenarios/17-print-builtin/site.mncnk",
);
console.log(fromFile.ok, fromFile.generatedFiles);

const fromSource = executeMoonChunk(
  'chunk "Main" { output: "./dist"; }; moon(Main);',
);
console.log(fromSource.ok, fromSource.diagnostics);
```

## Project Layout

```text
moonchunk/
├── MoonChunkLexer.g4
├── MoonChunkParser.g4
├── moonchunk/
│   ├── api.ts
│   ├── parser/
│   ├── runtime/
│   └── base.tpl
├── scripts/
└── examples/scenarios/
```

## Examples

- `examples/scenarios/16-metadata-common`
- `examples/scenarios/17-print-builtin`
- `examples/scenarios/18-recursive-function`
- `examples/scenarios/26-final-mandatory`
- `examples/scenarios/27-inc-and-parent-depth`
- `examples/scenarios/30-final-todo-coverage`

Run any example:

```bash
yarn start examples/scenarios/17-print-builtin/site.mncnk
```

## Ecosystem

- VS Code syntax highlight extension: [moonchunk-highlight-vscode-extension](https://github.com/dhunanyan/moonchunk-highlight-vscode-extension)

## Status

MoonChunk is under active development.  
The language is intentionally evolving and new tokens/runtime capabilities are being added incrementally.

## Contributing

Issues and pull requests are welcome.

Suggested flow:

1. Fork the repository.
2. Create a feature branch.
3. Add/update scenario examples when adding language behavior.
4. Run `yarn build` and `yarn run check`.
5. Open a pull request with a short change summary.

## License

MIT
