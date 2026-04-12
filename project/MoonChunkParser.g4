parser grammar MoonChunkParser;

options { tokenVocab=MoonChunkLexer; }

program
  : siteDecl EOF
  ;

siteDecl
  : SITE STRING LBRACE siteStatement* RBRACE SEMI
  ;

siteStatement
  : importStatement
  | outputStatement
  | envBlock
  | runtimeSiteStatement
  ;

runtimeSiteStatement
  : constStatement
  | letStatement
  | pageStatement
  | forStatement
  | ifStatement
  ;

importStatement
  : IMPORT STRING SEMI
  ;

outputStatement
  : OUTPUT STRING SEMI
  ;

envBlock
  : ENV LBRACE globalStatement* RBRACE SEMI
  ;

globalStatement
  : GLOBAL IDENTIFIER (COLON typeName)? ASSIGN expression SEMI
  ;

letStatement
  : LET IDENTIFIER (COLON typeName)? ASSIGN expression SEMI
  ;

constStatement
  : CONST IDENTIFIER (COLON typeName)? ASSIGN expression SEMI
  ;

contentStatement
  : CONTENT_START contentNode* CONTENT_END
  ;

contentNode
  : htmlElement
  | htmlSelfClosingElement
  | dynamicMustache
  | dynamicInline
  | textNode
  ;

htmlElement
  : LT IDENTIFIER attribute* GT contentNode* LT SLASH IDENTIFIER GT
  ;

htmlSelfClosingElement
  : LT IDENTIFIER attribute* SLASH GT
  ;

attribute
  : IDENTIFIER
  | IDENTIFIER ASSIGN STRING
  | IDENTIFIER ASSIGN LBRACE expression RBRACE
  ;

dynamicMustache
  : LBRACE expression RBRACE
  ;

dynamicInline
  : identifierPath
  | functionCall
  ;

textNode
  : CONTENT_TEXT
  | (IDENTIFIER | STRING | NUMBER | DOT | COMMA | COLON | PLUS | MINUS | STAR | SLASH)+
  ;

typeName
  : TYPE_INT
  | TYPE_FLOAT
  | TYPE_DOUBLE
  | TYPE_BOOL
  | TYPE_STRING
  ;

pageStatement
  : PAGE STRING USING STRING LBRACE pageInnerStatement* RBRACE SEMI
  ;

pageInnerStatement
  : letStatement
  | constStatement
  | contentStatement
  ;

forStatement
  : FOR IDENTIFIER IN expression LBRACE runtimeSiteStatement* RBRACE SEMI
  ;

ifStatement
  : IF LPAREN expression RPAREN LBRACE runtimeSiteStatement* RBRACE SEMI
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
