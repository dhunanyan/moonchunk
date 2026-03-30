# MoonChunk (npm package)

MoonChunk to pakiet npm z util funkcjami do wykonywania DSL static-site generatora.

## Rozszerzenie plików

- źródła MoonChunk: `*.mncnk`

## Co wspiera DSL

- `site "Name" { ... }`
- `output "./dist"`
- `env { global name: type = expr }` (globalna przestrzeń nazw)
- `import "./part/file.mncnk"` (wiele plików, także importy zagnieżdżone)
- `page "/path" using "layout.tpl" { ... }`
- `let variable = expression`
- `for item in expression { ... }`
- `if expression { ... }`
- typy: `int`, `float`, `double`, `bool`, `string`
- `content { ... }` z template tags:
  - `{{ expr }}`
  - `{% if cond %}...{% endif %}`
  - `{% for x in list %}...{% endfor %}`
- `data("file.json")`

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
1. generuje parser/lexer/visitor z `MoonChunk.g4` do `.antlr/`,
2. kompiluje TS do `dist/`.

## API

Eksporty:

- `executeMoonChunk(code, options?)`
- `executeMoonChunkFile(filePath, options?)` (wymaga rozszerzenia `.mncnk`)

Opcje:

- `cwd?: string` (bazowy katalog do `data(...)`, layoutów i outputu)
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
