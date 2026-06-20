parser grammar MoonChunkParser;

options { tokenVocab=MoonChunkLexer; }

program
  : importStatement* topLevelStatement+ EOF
  ;

fragmentProgram
  : importStatement* topLevelStatement+ EOF
  ;

topLevelStatement
  : chunkDecl
  | moonStatement
  ;

expressionFragment
  : expression EOF
  ;

chunkDecl
  : EXPORT? CHUNK chunkNameLiteral LBRACE includeStatement* chunkStatement* RBRACE SEMI
  ;

chunkNameLiteral
  : STRING
  ;

chunkStatement
  : outputStatement
  | envBlock
  | runtimeChunkStatement
  ;

includeStatement
  : INCLUDE identifierPath SEMI
  ;

moonStatement
  : MOON LPAREN identifierPath RPAREN SEMI
  ;

runtimeChunkStatement
  : functionDeclaration
  | arrowFunctionDeclaration
  | metaStatement
  | constStatement
  | letStatement
  | blockStatement
  | contentStatement
  | pageStatement
  | forStatement
  | whileStatement
  | ifStatement
  | breakStatement
  | continueStatement
  | returnStatement
  | expressionStatement
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
  : identifierAtom (AS identifierAtom)?
  ;

namespaceImportClause
  : STAR AS identifierAtom
  ;

outputStatement
  : OUTPUT COLON STRING SEMI
  ;

envBlock
  : ENV LBRACE globalStatement* RBRACE SEMI
  ;

globalStatement
  : GLOBAL identifierAtom (COLON typeName)? (ASSIGN expression)? SEMI
  ;

letStatement
  : LET identifierAtom (COLON typeName)? (ASSIGN expression)? SEMI
  ;

constStatement
  : CONST identifierAtom (COLON typeName)? ASSIGN expression SEMI
  ;

expressionStatement
  : expression SEMI
  ;

functionDeclaration
  : FUNCTION identifierAtom LPAREN parameterList? RPAREN (COLON returnTypeName)? LBRACE functionBodyStatement* RBRACE
  ;

arrowFunctionDeclaration
  : identifierAtom LPAREN parameterList? RPAREN (COLON returnTypeName)? ARROW arrowFunctionBody SEMI
  ;

parameterList
  : parameter (COMMA parameter)*
  ;

parameter
  : identifierAtom (COLON typeName)?
  ;

functionBodyStatement
  : constStatement
  | functionDeclaration
  | arrowFunctionDeclaration
  | letStatement
  | blockStatement
  | ifStatement
  | forStatement
  | whileStatement
  | breakStatement
  | continueStatement
  | returnStatement
  | expressionStatement
  ;

returnStatement
  : RETURN expression? SEMI
  ;

breakStatement
  : BREAK SEMI
  ;

continueStatement
  : CONTINUE SEMI
  ;

pageStatement
  : PAGE STRING LBRACE pageInnerStatement* RBRACE SEMI
  ;

pageInnerStatement
  : pageRuntimeStatement
  ;

pageRuntimeStatement
  : functionDeclaration
  | arrowFunctionDeclaration
  | metaStatement
  | constStatement
  | letStatement
  | blockStatement
  | contentStatement
  | forStatement
  | whileStatement
  | ifStatement
  | breakStatement
  | continueStatement
  | expressionStatement
  ;

metaStatement
  : identifierAtom COLON expression SEMI
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
  : LBRACE readExpression RBRACE
  ;

textNode
  : CONTENT_TEXT
  ;

whileStatement
  : WHILE LPAREN expression RPAREN runtimeBlock SEMI
  ;

forStatement
  : FOR LPAREN forInit SEMI expression SEMI forUpdate RPAREN runtimeBlock SEMI
  ;

forInit
  : LET typeName identifierAtom ASSIGN expression
  | LET identifierAtom (COLON typeName)? ASSIGN expression
  ;

forUpdate
  : expression
  ;

ifStatement
  : IF LPAREN expression RPAREN runtimeBlock (ELSE runtimeBlock)? SEMI
  ;

typeName
  : TYPE_INT
  | TYPE_FLOAT
  | TYPE_DOUBLE
  | TYPE_BOOL
  | TYPE_STRING
  | TYPE_NUMBER
  | TYPE_DICT
  | TYPE_OBJECT
  | TYPE_ARRAY
  | TYPE_NULL
  | TYPE_UNDEFINED
  | TYPE_UNKNOWN
  | TYPE_ANY
  ;

returnTypeName
  : typeName
  | TYPE_VOID
  ;

blockStatement
  : runtimeBlock SEMI?
  ;

runtimeBlock
  : LBRACE runtimeChunkStatement* RBRACE
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
  : castExpr ((STAR | SLASH | PERCENT) castExpr)*
  ;

unaryExpr
  : (NOT | MINUS | PLUS) unaryExpr
  | incExpr
  | callExpr
  ;

incExpr
  : PLUSPLUS identifierPath
  | identifierPath PLUSPLUS
  ;

castExpr
  : LPAREN typeName RPAREN castExpr
  | unaryExpr (AS typeName)*
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
  | TYPE_NULL
  | TYPE_UNDEFINED
  | identifierAtom
  | arrayLiteral
  | objectLiteral
  | LPAREN expression RPAREN
  ;

identifierAtom
  : IDENTIFIER
  ;

functionExpr
  : FUNCTION LPAREN parameterList? RPAREN (COLON returnTypeName)? LBRACE functionBodyStatement* RBRACE
  ;

arrowFunctionExpr
  : LPAREN parameterList? RPAREN (COLON returnTypeName)? ARROW arrowFunctionBody
  | identifierAtom (COLON returnTypeName)? ARROW arrowFunctionBody
  ;

arrowFunctionBody
  : expression
  | LBRACE functionBodyStatement* RBRACE
  ;

argumentList
  : expression (COMMA expression)*
  ;

arrayLiteral
  : LBRACKET (expression (COMMA expression)*)? COMMA? RBRACKET
  ;

objectLiteral
  : LBRACE (objectProperty (COMMA objectProperty)*)? COMMA? RBRACE
  ;

objectProperty
  : (identifierAtom | STRING | NUMBER) COLON expression
  ;

identifierPath
  : parentPathPrefix? identifierAtom (DOT identifierAtom | LBRACKET expression RBRACKET)*
  ;

parentPathPrefix
  : (PARENT SCOPE)+
  ;
