# MoonChunk (npm package)

MoonChunk to pakiet npm z util funkcjami do wykonywania DSL static-site generatora.

## Rozszerzenie plików

- źródła MoonChunk: `*.mncnk`

## Co wspiera DSL

- `chunk "Name" { ... };`
- `output "./dist";`
- `env { global name: type = expr; ... };` (globalna przestrzeń nazw)
- `import { A, B } from "./part/file.mncnk";`
- `import * as AnyName from "./part/file.mncnk";` (ładuje wszystkie chunki z pliku)
- `page "/path" { ... };`
- `let variable = expression;`
- `const variable = expression;`
- `title: "My page";` (skrócona składnia metadanych)
- `output: "./dist";` (alternatywa dla `output "./dist";`)
- `for (let int i = 0; i < limit; i++) { ... };`
- `if (expression) { ... };`
- typy: `int`, `float`, `double`, `bool`, `string`
- `content { ... };` z dynamicznymi wyrażeniami:
  - `<div>{expr}</div>`
  - `<div>{condition ? "A" : "B"}</div>`
  - `<div>{myFunc()}</div>`
- `data("file.json")`

Uwaga:
- aliasy w named import (`A as B`) nie są jeszcze wspierane runtime i zgłaszają błąd.
- skrócona składnia `key: expr;` działa tylko dla wspieranych kluczy layoutu `base.tpl` oraz `output`.
- layout jest wewnętrzny i stały: `moonchunk/base.tpl` (nie podajemy już `using "layout.tpl"`).

## Instalacja

```bash
cd /Users/dhunanyan/studies/kompilatory/project
yarn install
```

## Build flow (ANTLR TS + kompilacja TS)

```bash
yarn build
```

`yarn build` automatycznie:
1. generuje parser/lexer/visitor z `MoonChunkLexer.g4` i `MoonChunkParser.g4` do `.antlr/`,
2. kompiluje TS do `dist/`.

## API

Eksporty:

- `executeMoonChunk(code, options?)`
- `executeMoonChunkFile(filePath, options?)` (wymaga rozszerzenia `.mncnk`)

Opcje:

- `cwd?: string` (bazowy katalog do `data(...)` i outputu)
- `writeFiles?: boolean` (domyślnie `true`)

## Global namespace (2-pass)

1. Pass 1: rejestracja wszystkich deklaracji `global` z bloków `env`.
2. Pass 2: ewaluacja i wykonanie programu.

Błędy:
- redeklaracja globala -> błąd,
- użycie niezarejestrowanej zmiennej -> błąd.

## Przykład uruchomienia pliku

```ts
import { executeMoonChunkFile } from "moonchunk";

const result = executeMoonChunkFile(
  "/Users/dhunanyan/studies/kompilatory/project/examples/miniblog.mncnk",
);
console.log(result.ok);
console.log(result.generatedFiles);
console.log(result.diagnostics);
```

## Demo input

- `/Users/dhunanyan/studies/kompilatory/project/examples/scenarios/07-basic-calculations/site.mncnk`
