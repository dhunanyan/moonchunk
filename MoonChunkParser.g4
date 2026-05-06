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
  : GLOBAL identifierAtom (COLON typeName)? ASSIGN expression SEMI
  ;

letStatement
  : LET identifierAtom (COLON typeName)? ASSIGN expression SEMI
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
  : identifierAtom PLUSPLUS
  | PLUSPLUS identifierAtom
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
  | callExpr
  ;

castExpr
  : unaryExpr (AS typeName)*
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
  | identifierAtom
  | LPAREN expression RPAREN
  ;

identifierAtom
  : IDENTIFIER
  | metaKey
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

identifierPath
  : IDENTIFIER (DOT IDENTIFIER)*
  ;
