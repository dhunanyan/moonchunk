parser grammar MoonChunkParser;

options { tokenVocab=MoonChunkLexer; }

program
  : chunkDecl+ EOF
  ;

fragmentProgram
  : chunkDecl+ EOF
  ;

expressionFragment
  : expression EOF
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
  | arrowFunctionDeclaration
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
  : LBRACE importItem (COMMA importItem)* COMMA? RBRACE
  ;

importItem
  : IDENTIFIER (AS IDENTIFIER)?
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

expressionStatement
  : expression SEMI
  ;

functionDeclaration
  : FUNCTION IDENTIFIER LPAREN parameterList? RPAREN (COLON typeName)? LBRACE functionBodyStatement* RBRACE
  ;

arrowFunctionDeclaration
  : IDENTIFIER LPAREN parameterList? RPAREN (COLON typeName)? ARROW arrowFunctionBody SEMI
  ;

parameterList
  : parameter (COMMA parameter)*
  ;

parameter
  : IDENTIFIER (COLON typeName)?
  ;

functionBodyStatement
  : constStatement
  | arrowFunctionDeclaration
  | letStatement
  | ifStatement
  | forStatement
  | returnStatement
  | expressionStatement
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
  | IDENTIFIER ASSIGN LBRACE readExpression RBRACE
  ;

dynamicMustache
  : LBRACE dynamicRenderExpr RBRACE
  ;

dynamicRenderExpr
  : renderTernaryExpr
  ;

renderTernaryExpr
  : orExpr QUESTION dynamicRenderExpr COLON dynamicRenderExpr
  | renderAtom
  ;

renderAtom
  : invokedCallable
  | STRING
  | NUMBER
  | TRUE
  | FALSE
  | LPAREN dynamicRenderExpr RPAREN
  ;

invokedCallable
  : callablePrimary LPAREN argumentList? RPAREN (LPAREN argumentList? RPAREN)*
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

readExpression
  : conditionalExpr
  ;

assignment
  : identifierPath ASSIGN assignment
  | conditionalExpr
  ;

conditionalExpr
  : orExpr (QUESTION expression COLON conditionalExpr)?
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
  | callExpr
  ;

callExpr
  : callablePrimary (LPAREN argumentList? RPAREN)*
  | nonCallablePrimary
  ;

callablePrimary
  : arrowFunctionExpr
  | functionExpr
  | identifierPath
  | LPAREN arrowFunctionExpr RPAREN
  | LPAREN functionExpr RPAREN
  | LPAREN identifierPath RPAREN
  ;

nonCallablePrimary
  : STRING
  | NUMBER
  | TRUE
  | FALSE
  | LPAREN expression RPAREN
  ;

functionExpr
  : FUNCTION LPAREN parameterList? RPAREN (COLON typeName)? LBRACE functionBodyStatement* RBRACE
  ;

arrowFunctionExpr
  : LPAREN parameterList? RPAREN (COLON typeName)? ARROW arrowFunctionBody
  | IDENTIFIER (COLON typeName)? ARROW arrowFunctionBody
  ;

arrowFunctionBody
  : expression
  | LBRACE functionBodyStatement* RBRACE
  ;

argumentList
  : expression (COMMA expression)*
  ;

identifierPath
  : IDENTIFIER (DOT IDENTIFIER)*
  ;
