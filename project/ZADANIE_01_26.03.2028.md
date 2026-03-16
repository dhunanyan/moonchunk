# Zadanie

Na ćwiczenia w dniu `26.03` należy przygotować wersję „Hello world” Państwa języka.

W ramach tej wersji należy:

- przygotować (wstępną) gramatykę Państwa języka w formacie narzędzia do generowania parserów, którego będziecie używać (np. antlr, bison, itp.)
- przygotować obsługę podstawowych instrukcji z tworzonego języka (np. poruszanie robotem/żółwiem, itp.) Na razie nie trzeba implementować deklarowania funkcji, pętli, itp. Ma być to minimalistyczna wersja w której da się pisać elementarne programy typu „hello world”. Na tym etapie należy zdecydować czy implementujecie Państwo translator, interpreter czy kompilator. W razie wątpliwości sugeruję wybór interpretera (będzie najlepszy w większości przypadków)
- przygotować wstępną wersję wizualizująca działanie programu (np. jeśli jest to program typu „logo” to należy dodać rysowanie planszy pokazywanie żółwia na danej pozycji, itp.).
- zaimplementować prostą obsługę błędów syntaktycznych – jeśli program nie jest zgodny z gramatyką języka nie należy próbować go wykonywać tylko poinformować użytkownika, że program jest syntaktycznie niepoprawny (dobrze też poinformować w której linii kodu źródłowego jest błąd – ale ten element nie jest obowiązkowy na tym etapie prac).
- przygotować proste programy typu „hello world” i przetestować czy Państwa interpreter/translator/kompilator działa poprawnie dla tych programów.

# Projekt

## Uwagi ogólne

- projektowany język powinien być bezkontekstowy (ale nie regularny)

## Elementy, które powinien posiadać projektowany język:

- odpowiednik zmiennych (w tym zasięgi (scope) obowiązywania zmiennych)
- operacje arytmetyczne za zmiennych (odpowiednik dodawania, odejmowania, mnożenia, itd., nawiasowanie)
- Typ logiczny („true”/”false”) i co najmniej podstawowe operacje logiczne (and, or, not, nawiasowanie) na zmiennych logicznych i stałych oraz porównywanie zmiennych typu numerycznego (<, > , ==, !=) co w wyniku powinno dawać typ logiczny
- rodzaj instrukcji warunkowej (odpowiednik if)
- rodzaj pętli/iteracji (odpowiednik for/while) - dowolnie zagnieżdżonych
- odpowiednik procedur/funkcji (w tym możliwość wywoływania rekurencyjnego) z z argumentami (powinna być co najmniej możliwość przekazywania argumentów przez wartość)
- 'przyjazne' dla użytkownika komunikaty o błędach. Informacja o numerze linii (i ewentualnie kolumny), w której wystąpił błąd.

## Elementy nadobowiązkowe:

- translacja kodu do kodu pewnej maszyny wirtualnej. Wykonywanie kodu przez VM
