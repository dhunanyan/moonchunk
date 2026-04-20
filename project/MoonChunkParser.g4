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
  | metaStatement
  | constStatement
  | letStatement
  | pageStatement
  | forStatement
  | whileStatement
  | ifStatement
  | breakStatement
  | continueStatement
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
  : IDENTIFIER (AS IDENTIFIER)?
  ;

namespaceImportClause
  : STAR AS IDENTIFIER
  ;

outputStatement
  : OUTPUT COLON STRING SEMI
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
  | whileStatement
  | breakStatement
  | continueStatement
  | returnStatement
  | expressionStatement
  ;

returnStatement
  : RETURN expression SEMI
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
  : letStatement
  | constStatement
  | metaStatement
  | contentStatement
  ;

metaStatement
  : metaKey COLON expression SEMI
  ;

metaKey
  : META_LANG
  | META_DIR
  | META_HTML_CLASS
  | META_CHARSET
  | META_VIEWPORT
  | META_TITLE
  | META_DESCRIPTION
  | META_KEYWORDS
  | META_AUTHOR
  | META_ROBOTS
  | META_THEME_COLOR
  | META_CANONICAL_URL
  | META_FAVICON_HREF
  | META_APPLE_TOUCH_ICON
  | META_MANIFEST_HREF
  | META_OG_TYPE
  | META_OG_TITLE
  | META_OG_DESCRIPTION
  | META_OG_IMAGE
  | META_OG_URL
  | META_OG_SITE_NAME
  | META_OG_LOCALE
  | META_TWITTER_CARD
  | META_TWITTER_SITE
  | META_TWITTER_CREATOR
  | META_TWITTER_TITLE
  | META_TWITTER_DESCRIPTION
  | META_TWITTER_IMAGE
  | META_PRELOAD_LINKS
  | META_PRECONNECT_LINKS
  | META_STYLES
  | META_HEAD_SCRIPTS
  | META_HEAD_EXTRA
  | META_BODY_CLASS
  | META_PAGE_ID
  | META_TOP_BAR
  | META_HEADER
  | META_FOOTER
  | META_MODALS
  | META_SCRIPTS
  | META_BODY_END_EXTRA
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
  : WHILE LPAREN expression RPAREN LBRACE runtimeChunkStatement* RBRACE SEMI
  ;

forStatement
  : FOR LPAREN forInit SEMI expression SEMI forUpdate RPAREN LBRACE runtimeChunkStatement* RBRACE SEMI
  ;

forInit
  : LET typeName IDENTIFIER ASSIGN expression
  | LET IDENTIFIER (COLON typeName)? ASSIGN expression
  ;

forUpdate
  : IDENTIFIER PLUSPLUS
  | PLUSPLUS IDENTIFIER
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
  : unaryExpr ((STAR | SLASH | PERCENT) unaryExpr)*
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
