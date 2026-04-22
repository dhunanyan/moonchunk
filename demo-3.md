# MoonChunk - Demo 3 (szkic slajdów)

## Slajd 1: Metadata bez `layout.tpl`

- Nie używamy już `layout.tpl` jako pliku wejściowego użytkownika.
- Metadata definiujemy bezpośrednio w `.mncnk`.
- Obsługujemy skończony zbiór tokenów metadata (i będziemy go rozszerzać).

```mncnk
chunk "Main" {
  output: "./dist";
  title: "Moja strona";
  metaDescription: "Opis SEO";
  ogTitle: "OpenGraph title";
  twitterCard: "summary_large_image";

  page "" {
    content {
      <h1>Hello MoonChunk</h1>
    };
  };
};

moon(Main);
```

## Slajd 2: `moon(Main);` jako entry point

- Wykonanie programu startuje od `moon(...)`.
- Możemy wywołać kilka entry pointów, np. `moon(Main); moon(Section);`.
- Bez `moon(...)` nic nie jest wykonywane.

```mncnk
chunk "Main" {
  output: "./dist";
  page "main" { content { <p>Main</p> }; };
};

chunk "Section" {
  output: "./dist";
  page "section" { content { <p>Section</p> }; };
};

moon(Main);
moon(Section);
```

## Slajd 3: Pętle - `for` z indeksem oraz `while`

- `for` działa z jawnie deklarowanym indeksem.
- Wspieramy też klasyczny `while`.

```mncnk
chunk "Loops" {
  output: "./dist";

  for(let index: int = 0; index < 3; index++) {
    page "for-{{index}}" {
      content { <p>FOR index: {index}</p> };
    };
  };

  let counter: int = 0;
  while(counter < 2) {
    page "while-{{counter}}" {
      content { <p>WHILE counter: {counter}</p> };
    };
    counter = counter + 1;
  };
};

moon(Loops);
```

## Slajd 4: `break` i `continue` w pętlach

- `break` i `continue` działają wyłącznie wewnątrz pętli.

```mncnk
chunk "LoopControl" {
  output: "./dist";

  for(let i: int = 0; i < 8; i++) {
    if(i % 2 != 0) {
      continue;
    };
    if(i > 4) {
      break;
    };

    page "item-{{i}}" {
      content { <p>Even and <= 4: {i}</p> };
    };
  };
};

moon(LoopControl);
```

## Slajd 5: Deklaracje zmiennych i scope

- Zmienne są rozdzielone kontekstowo (scope).
- Ta sama nazwa może istnieć w różnych blokach/funkcjach.

```mncnk
chunk "Scopes" {
  output: "./dist";
  let value: int = 1;

  function localScope(): int {
    let value: int = 10;
    return value;
  }

  page "" {
    let insidePage: int = localScope();
    content {
      <p>Global value: {value}</p>
      <p>Function value: {insidePage}</p>
    };
  };
};

moon(Scopes);
```

## Slajd 6: Redeclaracja i zmiana wartości (`const` vs `let`)

- `let` można nadpisywać.
- `const` jest niemutowalne po deklaracji.

```mncnk
chunk "Mutability" {
  output: "./dist";
  let counter: int = 0;
  counter = counter + 1;

  const appName: string = "MoonChunk";
  // appName = "Other";  // <- błąd wykonania

  page "" {
    content {
      <p>counter: {counter}</p>
      <p>appName: {appName}</p>
    };
  };
};

moon(Mutability);
```

## Slajd 7: Metadata z różnych chunków (priorytet)

- `@include` może łączyć metadata z wielu chunków.
- Dla metadata obowiązuje zasada: ostatnia wartość wygrywa.

```mncnk
chunk "MetaBase" {
  title: "Title Base";
  metaDescription: "Opis bazowy";
};

chunk "MetaOverride" {
  title: "Title Override";
};

chunk "Main" {
  @include MetaBase;
  @include MetaOverride;
  output: "./dist";

  page "" {
    content { <p>Sprawdź finalny tytuł w wygenerowanym HTML.</p> };
  };
};

moon(Main);
```

## Slajd 8: Aktualny model importów i include chunków

- Import:
  - `import * as Fragments from "...";`
  - `import { ChunkName } from "...";`
- Include:
  - `@include Fragments.ChunkName;`
  - `@include ChunkName;`
- Import tylko udostępnia chunki; wykonanie następuje przez `@include` lub `moon(...)`.

```mncnk
import * as Fragments from "./fragments.mncnk";
import { SharedHeader } from "./header.mncnk";

chunk "Main" {
  @include Fragments.SharedMeta;
  @include SharedHeader;
  output: "./dist";
  page "" { content { <p>Import + include</p> }; };
};

moon(Main);
```

## Slajd 9: `print(...)` jako wbudowana funkcja języka

- `print(...)` działa jak globalny builtin.
- Obsługuje wiele argumentów i różne typy.

```mncnk
chunk "PrintDemo" {
  function greet(): string { return "hello"; }

  print(1, 1.0, true, "txt");
  print(greet);      // referencja do funkcji
  print(greet());    // wynik wywołania
  print(PrintDemo);  // obiekt chunka
};

moon(PrintDemo);
```

## Slajd 10: Funkcja rekurencyjna + scope wewnątrz funkcji

- Rekurencja działa.
- Zmienna sterująca jest lokalna dla funkcji (parametr), nie globalna.
- Warunek stopu kończy rekurencję.

```mncnk
chunk "Main" {
  output: "./dist";

  function walk(index: int): int {
    print("recursive index:", index);
    return (index >= 5) ? index : walk(index + 1);
  }

  let finalIndex: int = walk(0);
  print("final index:", finalIndex);

  page "" {
    content {
      <p>Final index: {finalIndex}</p>
    };
  };
};

moon(Main);
```

## Slajd 11: Komendy do live demo (część 3)

```bash
yarn build
yarn start examples/scenarios/16-metadata-common/site.mncnk
yarn start examples/scenarios/17-print-builtin/site.mncnk
yarn start examples/scenarios/18-recursive-function/site.mncnk
```
