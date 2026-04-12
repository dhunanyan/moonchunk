# MoonChunk - Tech Demo (szkic slajdów)

## Slajd 1: Tytuł
**MoonChunk: mini język DSL do generowania statycznych stron**
- Projekt z obszaru kompilatorów/interpreterów
- Wejście: pliki `.mncnk`
- Wyjście: gotowe pliki HTML

## Slajd 2: Problem i cel
**Co chcieliśmy zbudować?**
- Język domenowy do opisu stron i treści
- Czytelna składnia dla użytkownika
- Możliwość modularnego rozbijania projektu na wiele plików
- Silnik z walidacją i komunikatami błędów

## Slajd 3: Najważniejsze elementy DSL (na bazie scenariuszy)
- `site "..." { ... }` + `output "./dist"`
- `page "..." using "layout.tpl" { ... }`
- `let` (zmienne lokalne)
- `import` (podział na moduły)
- `for` i `if`
- `data("plik.json")`
- `env { global ... }` (globalna przestrzeń nazw)
- Typy: `int`, `float`, `double`, `bool`, `string`

## Slajd 4: Scenariusz 01 - Minimalny działający site
**examples/scenarios/01-site-basic**
- Najprostszy przepływ: `site -> page -> content`
- Zmienne lokalne `let title`, `let msg`
- Render przez `layout.tpl`
- Efekt: `dist/index.html`

## Slajd 5: Scenariusze 02-06 - Modularność i importy
**examples/scenarios/02...06** pokazują, że importowany plik może zaczynać się od:
- `page` (02)
- `for` (03)
- `if` (04)
- `let` (05)
- oraz importów zagnieżdżonych (06: `root -> shared/pages`)

**Wniosek:** projekt wspiera składanie aplikacji z wielu plików `.mncnk`.

## Slajd 6: Scenariusz 03 - Generowanie wielu stron z pętli
**examples/scenarios/03-import-for-start**
- `for item in data("items.json")`
- Dynamiczna ścieżka strony: `"/items/{{item.slug}}.html"`
- Efekt: wiele plików HTML wygenerowanych automatycznie

## Slajd 7: Scenariusz 04 - Warunkowe generowanie
**examples/scenarios/04-import-if-start**
- Flaga `enabled`
- `if enabled == true { page ... }`
- Strona generuje się tylko, gdy warunek jest spełniony

## Slajd 8: Scenariusze 07 i 08 - Typy i globalny scope
**examples/scenarios/07-basic-calculations**
- Operacje arytmetyczne i logiczne na typach liczbowych
- Różnice między `int`, `float`, `double`
- Porównania i składanie warunków logicznych

**examples/scenarios/08-global-env-basic**
- `env { global ... }`
- Zmienne globalne dostępne przy renderowaniu strony

## Slajd 9: Co to pokazuje od strony "kompilatorowej"
- Parsing składni DSL (ANTLR)
- Budowa AST
- Interpretacja AST i ewaluacja wyrażeń
- 2-przebiegowe przetwarzanie globalnych zmiennych:
  - przebieg 1: rejestracja deklaracji
  - przebieg 2: obliczanie wartości i użycie
- Generacja artefaktów końcowych (`.html`)

## Slajd 10: Proponowany live demo flow
1. Uruchom scenariusz 01 (baseline)
2. Pokaż import `page` (02)
3. Pokaż generowanie wielu stron z `for` (03)
4. Pokaż warunek `if` (04)
5. Pokaż import chain (06)
6. Pokaż typy i obliczenia (07)
7. Pokaż globals w `env` (08)

## Slajd 11: Jak uruchomić demo
```bash
cd /Users/dhunanyan/studies/kompilatory/project
sh scripts/build.sh
bash ./scripts/start.sh ./examples/scenarios/08-global-env-basic/site.mncnk
```

Można analogicznie podmieniać ścieżkę na inne scenariusze.

## Slajd 12: Podsumowanie
- MoonChunk działa jako praktyczny DSL + interpreter
- Obsługuje modułowość, warunki, pętle, dane JSON i typy
- Generuje gotowe strony statyczne
- Ma podstawy pod dalszy rozwój (np. CLI, playground, VM)
