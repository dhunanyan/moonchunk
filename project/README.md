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
