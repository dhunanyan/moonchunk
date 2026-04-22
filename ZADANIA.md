# ZADANIA

## Zadania na 26.03 ✅

```
Na ćwiczenia w dniu 26.03 należy przygotować wersję „Hello world” Państwa języka.

W ramach tej wersji należy:

przygotować (wstępną) gramatykę Państwa języka w formacie narzędzia do generowania parserów, którego będziecie używać (np. antlr, bison, itp.)

przygotować obsługę podstawowych instrukcji z tworzonego języka (np. poruszanie robotem/żółwiem, itp.) Na razie nie trzeba implementować deklarowania funkcji, pętli, itp. Ma być to minimalistyczna wersja w której da się pisać elementarne programy typu „hello world”. Na tym etapie należy zdecydować czy implementujecie Państwo translator, interpreter czy kompilator. W razie wątpliwości sugeruję wybór interpretera (będzie najlepszy w większości przypadków)

przygotować wstępną wersję wizualizująca działanie programu (np. jeśli jest to program typu „logo” to należy dodać rysowanie planszy pokazywanie żółwia na danej pozycji, itp.).

zaimplementować prostą obsługę błędów syntaktycznych – jeśli program nie jest zgodny z gramatyką języka nie należy próbować go wykonywać tylko poinformować użytkownika, że program jest syntaktycznie niepoprawny (dobrze też poinformować w której linii kodu źródłowego jest błąd – ale ten element nie jest obowiązkowy na tym etapie prac).

przygotować proste programy typu „hello world” i przetestować czy Państwa interpreter/translator/kompilator działa poprawnie dla tych programów.
```

## Zadania na 16.04 ✅

```
Należy rozszerzyć implementację swojego języka o następujące elementy:

Typ numeryczny i co najmniej podstawowe operacje arytmetyczne (dodawanie, odejmowanie, mnożenie, dzielenie, nawiasowanie) na stałych typu numerycznego.

Typ logiczny („true”/”false”) i co najmniej podstawowe operacje logiczne (and, or, not, nawiasowanie) na  stałych oraz porównywanie stałych typu numerycznego (<, > , ==, !=) co w wyniku powinno dawać typ logiczny

Obsługa globalnej przestrzeni nazw dla zmiennych (zgodnie z tym, o czym mówiłem na ostatnich ćwiczeniach). Należy zaimplementować 2-przebiegowy proces użycia zmiennych. W pierwszym przebiegu rejestrujemy (np. w mapie/słowniku) deklaracje wszystkich zmiennych wraz z ich typami (w tym przebiegu należy zgłosić błąd jeśli nastąpiła redeklaracja zmiennej). W tym przebiegu wygodnie jest użyć listenera. W drugim przebiegu wykonujemy (podstawowe)  operacje na zmiennych (opisane powyżej w zadaniu - dodawanie, odejmowanie, itd.). W tym przebiegu należy zgłosić błąd jeśli użyta zmienna nie została zarejestrowana (w globalnej przestrzeni zmiennych).
```

## Zadania na 07.05 ✅

```
Należy rozszerzyć implementację swojego języka o następujące elementy:

 podstawowe operacje arytmetyczne (dodawanie, odejmowanie, mnożenie, dzielenie, nawiasowanie) na zmiennych typu numerycznego.

 podstawowe operacje logiczne (and, or, not, nawiasowanie) na zmiennych logicznych oraz porównywanie zmiennych typu numerycznego (<, > , ==, !=) co w wyniku powinno dawać typ logiczny

Odpowiednik instrukcji warunkowej if/else

odpowiednik pętli for/while
porównania (==, !=) dla typu logicznego
obsługę definiowania i wywoływania funkcji. Funkcja powinna pozwalać na zwracanie rezultatu (powinna istnieć też możliwość definiowania funkcji zwracającej void) i przyjmować zadeklarowaną liczbę oraz typy argumentów.
```
