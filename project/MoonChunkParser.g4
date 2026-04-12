parser grammar MoonChunkParser;

options { tokenVocab=MoonChunkLexer; }

program
  : chunkDecl+ EOF
  ;

fragmentProgram
  : chunkStatement* EOF
  ;

chunkDecl
  : CHUNK chunkNameLiteral LBRACE chunkStatement* RBRACE SEMI
  ;

chunkNameLiteral
  : STRING
  ;

chunkStatement
  : importStatement
  | outputStatement
  | envBlock
  | runtimeChunkStatement
  ;

runtimeChunkStatement
  : functionDeclaration
  | constStatement
  | letStatement
  | pageStatement
  | forStatement
  | ifStatement
  ;

importStatement
  : IMPORT importClause FROM STRING SEMI
  ;

importClause
  : namedImportClause
  | namespaceImportClause
  ;

namedImportClause
  : LBRACE importItem (COMMA importItem)* RBRACE
  ;

importItem
  : IDENTIFIER
  ;

namespaceImportClause
  : STAR AS IDENTIFIER
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

functionDeclaration
  : FUNCTION IDENTIFIER LPAREN parameterList? RPAREN (COLON typeName)? LBRACE functionBodyStatement* RBRACE
  ;

parameterList
  : parameter (COMMA parameter)*
  ;

parameter
  : IDENTIFIER (COLON typeName)?
  ;

functionBodyStatement
  : constStatement
  | letStatement
  | ifStatement
  | forStatement
  | returnStatement
  ;

returnStatement
  : RETURN expression SEMI
  ;

pageStatement
  : PAGE STRING USING STRING LBRACE pageInnerStatement* RBRACE SEMI
  ;

pageInnerStatement
  : letStatement
  | constStatement
  | contentStatement
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
  : expression
  ;

textNode
  : CONTENT_TEXT
  ;

forStatement
  : FOR IDENTIFIER IN expression LBRACE runtimeChunkStatement* RBRACE SEMI
  ;

ifStatement
  : IF LPAREN expression RPAREN LBRACE runtimeChunkStatement* RBRACE SEMI
  ;

typeName
  : TYPE_INT
  | TYPE_FLOAT
  | TYPE_DOUBLE
  | TYPE_BOOL
  | TYPE_STRING
  ;

expression
  : assignment
  ;

assignment
  : identifierPath ASSIGN assignment
  | orExpr
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
