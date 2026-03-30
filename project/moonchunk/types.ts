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

export type AstImportNode = {
  type: 'Import';
  value: string;
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

export type AstContentNode = {
  type: 'Content';
  template: string;
  line: number;
};

export type AstPageNode = {
  type: 'Page';
  route: string;
  layout: string;
  body: Array<AstLetNode | AstContentNode | null>;
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

export type AstRuntimeNode = AstLetNode | AstPageNode | AstForNode | AstIfNode;

export type AstSiteNode = {
  type: 'Site';
  name: string;
  body: Array<AstNode | null>;
};

export type AstNode = AstImportNode | AstOutputNode | AstEnvNode | AstGlobalNode | AstRuntimeNode;

export type GlobalSymbol = {
  declaredType: string | null;
  expr: string;
  line: number;
  dir: string;
};
