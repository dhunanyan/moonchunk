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
  | envBlock
  | runtimeSiteStatement
  ;

runtimeSiteStatement
  : letStatement
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

envBlock
  : ENV LBRACE NEWLINE* globalStatement* RBRACE NEWLINE*
  ;

globalStatement
  : GLOBAL IDENTIFIER (COLON typeName)? ASSIGN expression NEWLINE+
  ;

letStatement
  : LET IDENTIFIER (COLON typeName)? ASSIGN expression NEWLINE+
  ;

typeName
  : TYPE_INT
  | TYPE_FLOAT
  | TYPE_DOUBLE
  | TYPE_BOOL
  | TYPE_STRING
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
  : FOR IDENTIFIER IN expression LBRACE NEWLINE* runtimeSiteStatement* RBRACE NEWLINE*
  ;

ifStatement
  : IF expression LBRACE NEWLINE* runtimeSiteStatement* RBRACE NEWLINE*
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
  : comparisonExpr ((EQ | NEQ) comparisonExpr)*
  ;

comparisonExpr
  : additiveExpr ((LT | GT | LTE | GTE) additiveExpr)*
  ;

additiveExpr
  : multiplicativeExpr ((PLUS | MINUS) multiplicativeExpr)*
  ;

multiplicativeExpr
  : unaryExpr ((STAR | SLASH) unaryExpr)*
  ;

unaryExpr
  : (NOT | MINUS) unaryExpr
  | primary
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
ENV     : 'env' ;
GLOBAL  : 'global' ;
PAGE    : 'page' ;
USING   : 'using' ;
LET     : 'let' ;
FOR     : 'for' ;
IN      : 'in' ;
IF      : 'if' ;
OR      : 'or' ;
AND     : 'and' ;
NOT     : 'not' ;
TRUE    : 'true' ;
FALSE   : 'false' ;
TYPE_INT    : 'int' ;
TYPE_FLOAT  : 'float' ;
TYPE_DOUBLE : 'double' ;
TYPE_BOOL   : 'bool' ;
TYPE_STRING : 'string' ;

EQ      : '==' ;
NEQ     : '!=' ;
ASSIGN  : '=' ;
PLUS    : '+' ;
MINUS   : '-' ;
STAR    : '*' ;
SLASH   : '/' ;
LT      : '<' ;
GT      : '>' ;
LTE     : '<=' ;
GTE     : '>=' ;
DOT     : '.' ;
COMMA   : ',' ;
COLON   : ':' ;
LPAREN  : '(' ;
RPAREN  : ')' ;
LBRACE  : '{' ;
RBRACE  : '}' ;

STRING
  : '"' ( '\\' . | ~["\\\r\n] )* '"'
  ;

NUMBER
  : [0-9]+ ('.' [0-9]+)? [fFdD]?
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
