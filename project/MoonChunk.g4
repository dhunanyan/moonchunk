grammar MoonChunk;

program
  : statement* EOF
  ;

statement
  : letStatement
  | functionDeclaration
  | ifStatement
  | whileStatement
  | forStatement
  | returnStatement
  | block
  | expression ';'
  ;

letStatement
  : 'let' IDENTIFIER '=' expression ';'
  ;

functionDeclaration
  : 'fn' IDENTIFIER '(' parameterList? ')' block
  ;

parameterList
  : IDENTIFIER (',' IDENTIFIER)*
  ;

ifStatement
  : 'if' '(' expression ')' statement ('else' statement)?
  ;

whileStatement
  : 'while' '(' expression ')' statement
  ;

forStatement
  : 'for' '(' forInit? ';' expression? ';' expression? ')' statement
  ;

forInit
  : 'let' IDENTIFIER '=' expression
  | expression
  ;

returnStatement
  : 'return' expression? ';'
  ;

block
  : '{' statement* '}'
  ;

expression
  : assignment
  ;

assignment
  : orExpr ('=' assignment)?
  ;

orExpr
  : andExpr ('or' andExpr)*
  ;

andExpr
  : equalityExpr ('and' equalityExpr)*
  ;

equalityExpr
  : comparisonExpr (('==' | '!=') comparisonExpr)*
  ;

comparisonExpr
  : additiveExpr (('<' | '>' | '<=' | '>=') additiveExpr)*
  ;

additiveExpr
  : multiplicativeExpr (('+' | '-') multiplicativeExpr)*
  ;

multiplicativeExpr
  : unaryExpr (('*' | '/') unaryExpr)*
  ;

unaryExpr
  : ('-' | 'not') unaryExpr
  | callExpr
  ;

callExpr
  : primary ('(' argumentList? ')')*
  ;

argumentList
  : expression (',' expression)*
  ;

primary
  : NUMBER
  | STRING
  | 'true'
  | 'false'
  | IDENTIFIER
  | '(' expression ')'
  ;

IDENTIFIER : [A-Za-z_] [A-Za-z0-9_]* ;
NUMBER     : [0-9]+ ('.' [0-9]+)? ;
STRING     : '"' ( '\\' . | ~["\\\r\n] )* '"' ;

WS            : [ \t\r\n]+ -> skip ;
LINE_COMMENT  : '//' ~[\r\n]* -> skip ;
