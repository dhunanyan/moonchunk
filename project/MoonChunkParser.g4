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
  | OUTPUT_COLON STRING SEMI
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
  : PAGE STRING LBRACE pageInnerStatement* RBRACE SEMI
  ;

pageInnerStatement
  : letStatement
  | constStatement
  | metaStatement
  | contentStatement
  ;

metaStatement
  : metaKeyColon expression SEMI
  ;

metaKeyColon
  : META_LANG_COLON
  | META_DIR_COLON
  | META_HTML_CLASS_COLON
  | META_CHARSET_COLON
  | META_VIEWPORT_COLON
  | META_TITLE_COLON
  | META_DESCRIPTION_COLON
  | META_KEYWORDS_COLON
  | META_AUTHOR_COLON
  | META_ROBOTS_COLON
  | META_THEME_COLOR_COLON
  | META_CANONICAL_URL_COLON
  | META_FAVICON_HREF_COLON
  | META_APPLE_TOUCH_ICON_COLON
  | META_MANIFEST_HREF_COLON
  | META_OG_TYPE_COLON
  | META_OG_TITLE_COLON
  | META_OG_DESCRIPTION_COLON
  | META_OG_IMAGE_COLON
  | META_OG_URL_COLON
  | META_OG_SITE_NAME_COLON
  | META_OG_LOCALE_COLON
  | META_TWITTER_CARD_COLON
  | META_TWITTER_SITE_COLON
  | META_TWITTER_CREATOR_COLON
  | META_TWITTER_TITLE_COLON
  | META_TWITTER_DESCRIPTION_COLON
  | META_TWITTER_IMAGE_COLON
  | META_PRELOAD_LINKS_COLON
  | META_PRECONNECT_LINKS_COLON
  | META_STYLES_COLON
  | META_HEAD_SCRIPTS_COLON
  | META_HEAD_EXTRA_COLON
  | META_BODY_CLASS_COLON
  | META_PAGE_ID_COLON
  | META_TOP_BAR_COLON
  | META_HEADER_COLON
  | META_FOOTER_COLON
  | META_MODALS_COLON
  | META_SCRIPTS_COLON
  | META_BODY_END_EXTRA_COLON
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
