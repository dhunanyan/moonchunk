export type ExecOptions = {
  cwd?: string;
  writeFiles?: boolean;
};

export type Diagnostic = {
  message: string;
  line: number;
  column: number;
};

export type ExecResult = {
  ok: boolean;
  output: string[];
  result: unknown;
  diagnostics: Diagnostic[];
  ast?: unknown;
  generatedFiles?: string[];
};

export type NumericType = 'int' | 'float' | 'double';
export type RuntimeType = NumericType | 'bool' | 'string' | 'unknown';

export type NumericValue = {
  __kind: 'numeric';
  numType: NumericType;
  value: number;
};

export type RuntimeHelpers = {
  getGlobal: (name: string, line: number) => unknown;
};

export type AstImportNamedItem = {
  name: string;
  alias: string | null;
};

export type AstImportClause =
  | { type: 'NamedImport'; items: AstImportNamedItem[] }
  | { type: 'NamespaceImport'; alias: string };

export type AstImportNode = {
  type: 'Import';
  clause: AstImportClause;
  source: string;
  line: number;
};

export type AstOutputNode = {
  type: 'Output';
  value: string;
  line: number;
};

export type AstGlobalNode = {
  type: 'Global';
  name: string;
  declaredType: string | null;
  expr: string;
  line: number;
};

export type AstEnvNode = {
  type: 'Env';
  body: AstGlobalNode[];
  line: number;
};

export type AstLetNode = {
  type: 'Let';
  name: string;
  declaredType: string | null;
  expr: string;
  line: number;
};

export type AstConstNode = {
  type: 'Const';
  name: string;
  declaredType: string | null;
  expr: string;
  line: number;
};

export type AstContentNode = {
  type: 'Content';
  template: string;
  line: number;
};

export type AstPageNode = {
  type: 'Page';
  route: string;
  layout: string;
  body: Array<AstLetNode | AstConstNode | AstContentNode | null>;
  line: number;
};

export type AstForNode = {
  type: 'For';
  item: string;
  sourceExpr: string;
  body: Array<AstRuntimeNode | null>;
  line: number;
};

export type AstIfNode = {
  type: 'If';
  condition: string;
  body: Array<AstRuntimeNode | null>;
  line: number;
};

export type AstParameter = {
  name: string;
  declaredType: string | null;
};

export type AstExpressionStatementNode = {
  type: 'ExpressionStatement';
  expr: string;
  line: number;
};

export type AstReturnNode = {
  type: 'Return';
  expr: string;
  line: number;
};

export type AstFunctionBodyNode =
  | AstConstNode
  | AstLetNode
  | AstIfNode
  | AstForNode
  | AstReturnNode
  | AstExpressionStatementNode
  | AstArrowFunctionDeclarationNode;

export type AstFunctionDeclarationNode = {
  type: 'FunctionDeclaration';
  name: string;
  params: AstParameter[];
  returnType: string | null;
  body: AstFunctionBodyNode[];
  line: number;
};

export type AstArrowFunctionDeclarationNode = {
  type: 'ArrowFunctionDeclaration';
  name: string;
  params: AstParameter[];
  returnType: string | null;
  bodyExpr: string;
  line: number;
};

export type AstRuntimeNode =
  | AstLetNode
  | AstConstNode
  | AstPageNode
  | AstForNode
  | AstIfNode
  | AstFunctionDeclarationNode
  | AstArrowFunctionDeclarationNode;

export type AstChunkStatement = AstImportNode | AstOutputNode | AstEnvNode | AstRuntimeNode;

export type AstChunkNode = {
  type: 'Chunk';
  name: string;
  body: Array<AstChunkStatement | null>;
  line: number;
};

export type AstProgramNode = {
  type: 'Program';
  chunks: AstChunkNode[];
};

export type AstNode = AstChunkStatement;

export type GlobalSymbol = {
  declaredType: string | null;
  expr: string;
  line: number;
  dir: string;
};
