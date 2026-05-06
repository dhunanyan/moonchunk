export type ExecOptions = {
  cwd?: string;
  writeFiles?: boolean;
  formatHtml?: boolean;
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

export type NumericType = "int" | "float" | "double";
export type RuntimeType =
  | NumericType
  | "bool"
  | "string"
  | "number"
  | "object"
  | "array"
  | "null"
  | "undefined"
  | "void"
  | "unknown"
  | "any";

export type NumericValue = {
  __kind: "numeric";
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
  | { type: "NamedImport"; items: AstImportNamedItem[] }
  | { type: "NamespaceImport"; alias: string };

export type AstImportNode = {
  type: "Import";
  clause: AstImportClause;
  source: string;
  line: number;
};

export type AstIncludeNode = {
  type: "Include";
  targetPath: string;
  line: number;
};

export type AstMoonNode = {
  type: "Moon";
  targetPath: string;
  line: number;
};

export type AstOutputNode = {
  type: "Output";
  value: string;
  line: number;
};

export type AstGlobalNode = {
  type: "Global";
  name: string;
  declaredType: string | null;
  expr: string;
  line: number;
};

export type AstEnvNode = {
  type: "Env";
  body: AstGlobalNode[];
  line: number;
};

export type AstLetNode = {
  type: "Let";
  name: string;
  declaredType: string | null;
  expr: string;
  line: number;
};

export type AstConstNode = {
  type: "Const";
  name: string;
  declaredType: string | null;
  expr: string;
  line: number;
};

export type AstMetaNode = {
  type: "Meta";
  name: string;
  expr: string;
  line: number;
};

export type AstContentNode = {
  type: "Content";
  template: string;
  line: number;
};

export type AstPageNode = {
  type: "Page";
  route: string;
  body: Array<AstLetNode | AstConstNode | AstMetaNode | AstContentNode | null>;
  line: number;
};

export type AstForNode = {
  type: "For";
  initName: string;
  initDeclaredType: string | null;
  initExpr: string;
  conditionExpr: string;
  updateName: string;
  updatePrefix: boolean;
  body: Array<AstRuntimeNode | null>;
  line: number;
};

export type AstWhileNode = {
  type: "While";
  condition: string;
  body: Array<AstRuntimeNode | null>;
  line: number;
};

export type AstIfNode = {
  type: "If";
  condition: string;
  body: Array<AstRuntimeNode | null>;
  elseBody: Array<AstRuntimeNode | null> | null;
  line: number;
};

export type AstParameter = {
  name: string;
  declaredType: string | null;
};

export type AstExpressionStatementNode = {
  type: "ExpressionStatement";
  expr: string;
  line: number;
};

export type AstReturnNode = {
  type: "Return";
  expr: string | null;
  line: number;
};

export type AstBreakNode = {
  type: "Break";
  line: number;
};

export type AstContinueNode = {
  type: "Continue";
  line: number;
};

export type AstFunctionBodyNode =
  | AstConstNode
  | AstFunctionDeclarationNode
  | AstLetNode
  | AstIfNode
  | AstForNode
  | AstWhileNode
  | AstBreakNode
  | AstContinueNode
  | AstReturnNode
  | AstExpressionStatementNode
  | AstArrowFunctionDeclarationNode;

export type AstFunctionDeclarationNode = {
  type: "FunctionDeclaration";
  name: string;
  params: AstParameter[];
  returnType: string | null;
  body: AstFunctionBodyNode[];
  line: number;
};

export type AstArrowFunctionDeclarationNode = {
  type: "ArrowFunctionDeclaration";
  name: string;
  params: AstParameter[];
  returnType: string | null;
  bodyExpr: string;
  line: number;
};

export type AstRuntimeNode =
  | AstMetaNode
  | AstLetNode
  | AstConstNode
  | AstExpressionStatementNode
  | AstPageNode
  | AstForNode
  | AstWhileNode
  | AstIfNode
  | AstBreakNode
  | AstContinueNode
  | AstFunctionDeclarationNode
  | AstArrowFunctionDeclarationNode;

export type AstChunkStatement = AstOutputNode | AstEnvNode | AstRuntimeNode;

export type AstChunkNode = {
  type: "Chunk";
  name: string;
  exported: boolean;
  includes: AstIncludeNode[];
  body: Array<AstChunkStatement | null>;
  line: number;
};

export type AstProgramNode = {
  type: "Program";
  imports: AstImportNode[];
  moons: AstMoonNode[];
  chunks: AstChunkNode[];
};

export type AstNode = AstChunkStatement;

export type GlobalSymbol = {
  declaredType: string | null;
  expr: string;
  line: number;
  dir: string;
};
