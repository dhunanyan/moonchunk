grammar MoonChunk;

program
  : NEWLINE* siteDecl NEWLINE* EOF
  ;

siteDecl
  : SITE STRING LBRACE NEWLINE* siteStatement* RBRACE
  ;

siteStatement
  : importStatement
  | outputStatement
  | letStatement
  | pageStatement
  | forStatement
  | ifStatement
  ;

importStatement
  : IMPORT STRING NEWLINE+
  ;

outputStatement
  : OUTPUT STRING NEWLINE+
  ;

letStatement
  : LET IDENTIFIER ASSIGN expression NEWLINE+
  ;

pageStatement
  : PAGE STRING USING STRING LBRACE NEWLINE* pageInnerStatement* RBRACE NEWLINE*
  ;

pageInnerStatement
  : letStatement
  | contentStatement
  ;

contentStatement
  : CONTENT_BLOCK NEWLINE*
  ;

forStatement
  : FOR IDENTIFIER IN expression LBRACE NEWLINE* siteStatement* RBRACE NEWLINE*
  ;

ifStatement
  : IF expression LBRACE NEWLINE* siteStatement* RBRACE NEWLINE*
  ;

expression
  : assignment
  ;

assignment
  : orExpr
  ;

orExpr
  : andExpr (OR andExpr)*
  ;

andExpr
  : equalityExpr (AND equalityExpr)*
  ;

equalityExpr
  : additiveExpr ((EQ | NEQ) additiveExpr)*
  ;

additiveExpr
  : primary (PLUS primary)*
  ;

primary
  : functionCall
  | identifierPath
  | STRING
  | NUMBER
  | TRUE
  | FALSE
  | LPAREN expression RPAREN
  ;

functionCall
  : IDENTIFIER LPAREN argumentList? RPAREN
  ;

argumentList
  : expression (COMMA expression)*
  ;

identifierPath
  : IDENTIFIER (DOT IDENTIFIER)*
  ;

SITE    : 'site' ;
IMPORT  : 'import' ;
OUTPUT  : 'output' ;
PAGE    : 'page' ;
USING   : 'using' ;
LET     : 'let' ;
FOR     : 'for' ;
IN      : 'in' ;
IF      : 'if' ;
OR      : 'or' ;
AND     : 'and' ;
TRUE    : 'true' ;
FALSE   : 'false' ;

EQ      : '==' ;
NEQ     : '!=' ;
ASSIGN  : '=' ;
PLUS    : '+' ;
DOT     : '.' ;
COMMA   : ',' ;
LPAREN  : '(' ;
RPAREN  : ')' ;
LBRACE  : '{' ;
RBRACE  : '}' ;

STRING
  : '"' ( '\\' . | ~["\\\r\n] )* '"'
  ;

NUMBER
  : [0-9]+ ('.' [0-9]+)?
  ;

IDENTIFIER
  : [A-Za-z_] [A-Za-z0-9_]*
  ;

CONTENT_BLOCK
  : 'content' [ \t]* '{' .*? '\r'? '\n' [ \t]* '}'
  ;

LINE_COMMENT
  : '//' ~[\r\n]* -> skip
  ;

WS
  : [ \t]+ -> skip
  ;

NEWLINE
  : ('\r'? '\n')+
  ;
