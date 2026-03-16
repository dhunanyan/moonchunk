# MoonChunk (npm package)

MoonChunk to pakiet npm z util funkcjami do wykonywania DSL static-site generatora.

## Rozszerzenie plików

- źródła MoonChunk: `*.mncnk`

## Co wspiera DSL

- `site "Name" { ... }`
- `output "./dist"`
- `import "./part/file.mncnk"` (wiele plików, także importy zagnieżdżone)
- `page "/path" using "layout.tpl" { ... }`
- `let variable = expression`
- `for item in expression { ... }`
- `if expression { ... }`
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
yarn antlr:generate:ts
yarn build
```

## API

Eksporty:

- `executeMoonChunk(code, options?)`
- `executeMoonChunkFile(filePath, options?)` (wymaga rozszerzenia `.mncnk`)

Opcje:

- `cwd?: string` (bazowy katalog do `data(...)`, layoutów i outputu)
- `writeFiles?: boolean` (domyślnie `true`)

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

- `/Users/dhunanyan/studies/kompilatory/project/examples/miniblog.mncnk`
- `/Users/dhunanyan/studies/kompilatory/project/examples/partials/home.mncnk`
- `/Users/dhunanyan/studies/kompilatory/project/examples/partials/posts.mncnk`
- `/Users/dhunanyan/studies/kompilatory/project/examples/layout.tpl`
- `/Users/dhunanyan/studies/kompilatory/project/examples/posts.json`
