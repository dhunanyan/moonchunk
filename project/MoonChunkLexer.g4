lexer grammar MoonChunkLexer;

CHUNK       : 'chunk' ;
AS          : 'as' ;
FROM        : 'from' ;
IMPORT      : 'import' ;
OUTPUT      : 'output' ;
OUTPUT_COLON: 'output' [ \t]* ':' ;
ENV         : 'env' ;
GLOBAL      : 'global' ;
PAGE        : 'page' ;
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
META_LANG_COLON                : 'lang' [ \t]* ':' ;
META_DIR_COLON                 : 'dir' [ \t]* ':' ;
META_HTML_CLASS_COLON          : 'htmlClass' [ \t]* ':' ;
META_CHARSET_COLON             : 'charset' [ \t]* ':' ;
META_VIEWPORT_COLON            : 'viewport' [ \t]* ':' ;
META_TITLE_COLON               : 'title' [ \t]* ':' ;
META_DESCRIPTION_COLON         : 'metaDescription' [ \t]* ':' ;
META_KEYWORDS_COLON            : 'metaKeywords' [ \t]* ':' ;
META_AUTHOR_COLON              : 'metaAuthor' [ \t]* ':' ;
META_ROBOTS_COLON              : 'metaRobots' [ \t]* ':' ;
META_THEME_COLOR_COLON         : 'themeColor' [ \t]* ':' ;
META_CANONICAL_URL_COLON       : 'canonicalUrl' [ \t]* ':' ;
META_FAVICON_HREF_COLON        : 'faviconHref' [ \t]* ':' ;
META_APPLE_TOUCH_ICON_COLON    : 'appleTouchIconHref' [ \t]* ':' ;
META_MANIFEST_HREF_COLON       : 'manifestHref' [ \t]* ':' ;
META_OG_TYPE_COLON             : 'ogType' [ \t]* ':' ;
META_OG_TITLE_COLON            : 'ogTitle' [ \t]* ':' ;
META_OG_DESCRIPTION_COLON      : 'ogDescription' [ \t]* ':' ;
META_OG_IMAGE_COLON            : 'ogImage' [ \t]* ':' ;
META_OG_URL_COLON              : 'ogUrl' [ \t]* ':' ;
META_OG_SITE_NAME_COLON        : 'ogSiteName' [ \t]* ':' ;
META_OG_LOCALE_COLON           : 'ogLocale' [ \t]* ':' ;
META_TWITTER_CARD_COLON        : 'twitterCard' [ \t]* ':' ;
META_TWITTER_SITE_COLON        : 'twitterSite' [ \t]* ':' ;
META_TWITTER_CREATOR_COLON     : 'twitterCreator' [ \t]* ':' ;
META_TWITTER_TITLE_COLON       : 'twitterTitle' [ \t]* ':' ;
META_TWITTER_DESCRIPTION_COLON : 'twitterDescription' [ \t]* ':' ;
META_TWITTER_IMAGE_COLON       : 'twitterImage' [ \t]* ':' ;
META_PRELOAD_LINKS_COLON       : 'preloadLinks' [ \t]* ':' ;
META_PRECONNECT_LINKS_COLON    : 'preconnectLinks' [ \t]* ':' ;
META_STYLES_COLON              : 'styles' [ \t]* ':' ;
META_HEAD_SCRIPTS_COLON        : 'headScripts' [ \t]* ':' ;
META_HEAD_EXTRA_COLON          : 'headExtra' [ \t]* ':' ;
META_BODY_CLASS_COLON          : 'bodyClass' [ \t]* ':' ;
META_PAGE_ID_COLON             : 'pageId' [ \t]* ':' ;
META_TOP_BAR_COLON             : 'topBar' [ \t]* ':' ;
META_HEADER_COLON              : 'header' [ \t]* ':' ;
META_FOOTER_COLON              : 'footer' [ \t]* ':' ;
META_MODALS_COLON              : 'modals' [ \t]* ':' ;
META_SCRIPTS_COLON             : 'scripts' [ \t]* ':' ;
META_BODY_END_EXTRA_COLON      : 'bodyEndExtra' [ \t]* ':' ;

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
