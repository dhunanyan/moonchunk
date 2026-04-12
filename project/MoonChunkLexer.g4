lexer grammar MoonChunkLexer;

CHUNK       : 'chunk' ;
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

ARROW   : '=>' ;
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
QUESTION: '?' ;
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
  : [ \t\r\n\f]* '}' [ \t\r\n\f]* ';' -> popMode
  ;

CONTENT_LT
  : '<' -> type(LT), pushMode(CONTENT_TAG_MODE)
  ;

CONTENT_LBRACE
  : '{' -> type(LBRACE), pushMode(CONTENT_EXPR_MODE)
  ;

CONTENT_TEXT
  : ~[<{}]+ 
  ;

mode CONTENT_TAG_MODE;

TAG_GT
  : '>' -> type(GT), popMode
  ;

TAG_SLASH
  : '/' -> type(SLASH)
  ;

TAG_ASSIGN
  : '=' -> type(ASSIGN)
  ;

TAG_IDENTIFIER
  : [A-Za-z_] [A-Za-z0-9_:-]* -> type(IDENTIFIER)
  ;

TAG_STRING
  : '"' ( '\\' . | ~["\\\r\n] )* '"' -> type(STRING)
  ;

TAG_LBRACE
  : '{' -> type(LBRACE), pushMode(CONTENT_EXPR_MODE)
  ;

TAG_WS
  : [ \t\r\n\f]+ -> skip
  ;

mode CONTENT_EXPR_MODE;

EXPR_RBRACE
  : '}' -> type(RBRACE), popMode
  ;

EXPR_LBRACE
  : '{' -> type(LBRACE), pushMode(CONTENT_EXPR_MODE)
  ;

EXPR_ARROW   : '=>' -> type(ARROW) ;
EXPR_EQ      : '==' -> type(EQ) ;
EXPR_NEQ     : '!=' -> type(NEQ) ;
EXPR_LTE     : '<=' -> type(LTE) ;
EXPR_GTE     : '>=' -> type(GTE) ;
EXPR_ASSIGN  : '=' -> type(ASSIGN) ;
EXPR_PLUS    : '+' -> type(PLUS) ;
EXPR_MINUS   : '-' -> type(MINUS) ;
EXPR_STAR    : '*' -> type(STAR) ;
EXPR_SLASH   : '/' -> type(SLASH) ;
EXPR_LT      : '<' -> type(LT) ;
EXPR_GT      : '>' -> type(GT) ;
EXPR_DOT     : '.' -> type(DOT) ;
EXPR_COMMA   : ',' -> type(COMMA) ;
EXPR_COLON   : ':' -> type(COLON) ;
EXPR_QUESTION: '?' -> type(QUESTION) ;
EXPR_LPAREN  : '(' -> type(LPAREN) ;
EXPR_RPAREN  : ')' -> type(RPAREN) ;
EXPR_SEMI    : ';' -> type(SEMI) ;

EXPR_CONST       : 'const' -> type(CONST) ;
EXPR_LET         : 'let' -> type(LET) ;
EXPR_FUNCTION    : 'function' -> type(FUNCTION) ;
EXPR_RETURN      : 'return' -> type(RETURN) ;
EXPR_FOR         : 'for' -> type(FOR) ;
EXPR_IN          : 'in' -> type(IN) ;
EXPR_IF          : 'if' -> type(IF) ;
EXPR_OR          : 'or' -> type(OR) ;
EXPR_AND         : 'and' -> type(AND) ;
EXPR_NOT         : 'not' -> type(NOT) ;
EXPR_TRUE        : 'true' -> type(TRUE) ;
EXPR_FALSE       : 'false' -> type(FALSE) ;
EXPR_TYPE_INT    : 'int' -> type(TYPE_INT) ;
EXPR_TYPE_FLOAT  : 'float' -> type(TYPE_FLOAT) ;
EXPR_TYPE_DOUBLE : 'double' -> type(TYPE_DOUBLE) ;
EXPR_TYPE_BOOL   : 'bool' -> type(TYPE_BOOL) ;
EXPR_TYPE_STRING : 'string' -> type(TYPE_STRING) ;

EXPR_STRING
  : '"' ( '\\' . | ~["\\\r\n] )* '"' -> type(STRING)
  ;

EXPR_NUMBER
  : [0-9]+ ('.' [0-9]+)? [fFdD]? -> type(NUMBER)
  ;

EXPR_IDENTIFIER
  : [A-Za-z_] [A-Za-z0-9_]* -> type(IDENTIFIER)
  ;

EXPR_LINE_COMMENT
  : '//' ~[\r\n]* -> skip
  ;

EXPR_WS
  : [ \t\r\n\f]+ -> skip
  ;
