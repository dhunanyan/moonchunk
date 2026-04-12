lexer grammar MoonChunkLexer;

CHUNK       : 'chunk' ;
ALL         : 'all' ;
AS          : 'as' ;
FROM        : 'from' ;
IMPORT      : 'import' ;
OUTPUT      : 'output' ;
ENV         : 'env' ;
GLOBAL      : 'global' ;
PAGE        : 'page' ;
USING       : 'using' ;
CONST       : 'const' ;
LET         : 'let' ;
FUNCTION    : 'function' ;
RETURN      : 'return' ;
FOR         : 'for' ;
IN          : 'in' ;
IF          : 'if' ;
OR          : 'or' ;
AND         : 'and' ;
NOT         : 'not' ;
TRUE        : 'true' ;
FALSE       : 'false' ;
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
SEMI    : ';' ;

CONTENT_START
  : 'content' [ \t\r\n]* '{' -> pushMode(CONTENT_MODE)
  ;

STRING
  : '"' ( '\\' . | ~["\\\r\n] )* '"'
  ;

NUMBER
  : [0-9]+ ('.' [0-9]+)? [fFdD]?
  ;

IDENTIFIER
  : [A-Za-z_] [A-Za-z0-9_]*
  ;

LINE_COMMENT
  : '//' ~[\r\n]* -> skip
  ;

WS
  : [ \t\r\n\f]+ -> skip
  ;

mode CONTENT_MODE;

CONTENT_END
  : '}' [ \t\r\n\f]* ';' -> popMode
  ;

C_EQ      : '==' -> type(EQ) ;
C_NEQ     : '!=' -> type(NEQ) ;
C_LTE     : '<=' -> type(LTE) ;
C_GTE     : '>=' -> type(GTE) ;
C_ASSIGN  : '=' -> type(ASSIGN) ;
C_PLUS    : '+' -> type(PLUS) ;
C_MINUS   : '-' -> type(MINUS) ;
C_STAR    : '*' -> type(STAR) ;
C_SLASH   : '/' -> type(SLASH) ;
C_LT      : '<' -> type(LT) ;
C_GT      : '>' -> type(GT) ;
C_DOT     : '.' -> type(DOT) ;
C_COMMA   : ',' -> type(COMMA) ;
C_COLON   : ':' -> type(COLON) ;
C_LPAREN  : '(' -> type(LPAREN) ;
C_RPAREN  : ')' -> type(RPAREN) ;
C_LBRACE  : '{' -> type(LBRACE) ;
C_RBRACE  : '}' -> type(RBRACE) ;

C_CHUNK    : 'chunk' -> type(CHUNK) ;
C_ALL      : 'all' -> type(ALL) ;
C_AS       : 'as' -> type(AS) ;
C_FROM     : 'from' -> type(FROM) ;
C_FOR      : 'for' -> type(FOR) ;
C_IN       : 'in' -> type(IN) ;
C_IF       : 'if' -> type(IF) ;
C_OR       : 'or' -> type(OR) ;
C_AND      : 'and' -> type(AND) ;
C_NOT      : 'not' -> type(NOT) ;
C_TRUE     : 'true' -> type(TRUE) ;
C_FALSE    : 'false' -> type(FALSE) ;
C_FUNCTION : 'function' -> type(FUNCTION) ;
C_RETURN   : 'return' -> type(RETURN) ;

C_STRING
  : '"' ( '\\' . | ~["\\\r\n] )* '"' -> type(STRING)
  ;

C_NUMBER
  : [0-9]+ ('.' [0-9]+)? [fFdD]? -> type(NUMBER)
  ;

C_IDENTIFIER
  : [A-Za-z_] [A-Za-z0-9_]* -> type(IDENTIFIER)
  ;

CONTENT_TEXT
  : ~[<{}]+ 
  ;
