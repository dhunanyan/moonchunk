import * as fs from "node:fs";
import * as path from "node:path";
import { CharStreams, CommonTokenStream } from "antlr4ts";
import { TerminalNode } from "antlr4ts/tree/TerminalNode";
import { MoonChunkLexer } from "../../.antlr/MoonChunkLexer";
import {
  AdditiveExprContext,
  AndExprContext,
  ArrowFunctionDeclarationContext,
  ArrowFunctionExprContext,
  AssignmentContext,
  CastExprContext,
  CallExprContext,
  CallablePrimaryContext,
  ComparisonExprContext,
  ConditionalExprContext,
  ConstStatementContext,
  EqualityExprContext,
  ExpressionContext,
  ExpressionFragmentContext,
  ForStatementContext,
  ArrayLiteralContext,
  WhileStatementContext,
  FunctionBodyStatementContext,
  FunctionDeclarationContext,
  FunctionExprContext,
  IdentifierAtomContext,
  IdentifierPathContext,
  IfStatementContext,
  LetStatementContext,
  MoonChunkParser,
  MultiplicativeExprContext,
  NonCallablePrimaryContext,
  ObjectLiteralContext,
  ObjectPropertyContext,
  OrExprContext,
  ParameterContext,
  ParameterListContext,
  RuntimeChunkStatementContext,
  UnaryExprContext,
} from "../../.antlr/MoonChunkParser";
import { MoonChunkError } from "../errors";
import { SyntaxCollector } from "../parser/syntax-collector";
import { RuntimeHelpers } from "../types";
import { Scope } from "./scope";
import {
  coerceToNumeric,
  inferType,
  isAssignable,
  isNumericValue,
  makeNumeric,
  normalizeJsonNumbers,
  promoteNumericType,
  stringifyValue,
} from "./values";

const NO_HELPERS: RuntimeHelpers = { getGlobal: () => undefined };

type RuntimeParameter = { name: string; declaredType: string | null };

type RuntimeCallable = {
  __kind: "moonchunk_callable";
  name?: string;
  params: RuntimeParameter[];
  returnType: string | null;
  invoke: (args: unknown[], line: number) => unknown;
};

type CastBoxType = "any" | "unknown";
type CastBox = {
  __kind: "cast_box";
  castType: CastBoxType;
  value: unknown;
};

type PathStep =
  | { kind: "prop"; key: string }
  | { kind: "index"; key: unknown };

class ReturnSignal {
  constructor(public readonly value: unknown) {}
}

class BreakSignal {}
class ContinueSignal {}

function isCastBox(value: unknown): value is CastBox {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __kind?: string }).__kind === "cast_box"
  );
}

function makeCallable(
  params: RuntimeParameter[],
  returnType: string | null,
  invoke: (args: unknown[], line: number) => unknown,
  name?: string,
): RuntimeCallable {
  return {
    __kind: "moonchunk_callable",
    name,
    params,
    returnType,
    invoke,
  };
}

function isCallable(value: unknown): value is RuntimeCallable {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { __kind?: string }).__kind === "moonchunk_callable"
  );
}

function parseQuotedString(text: string): string {
  try {
    return JSON.parse(text);
  } catch {
    if (text.startsWith('"') && text.endsWith('"')) return text.slice(1, -1);
    return text;
  }
}

function parseNumberLiteral(text: string): unknown {
  if (/[fF]$/.test(text))
    return makeNumeric(Number(text.slice(0, -1)), "float");
  if (/[dD]$/.test(text))
    return makeNumeric(Number(text.slice(0, -1)), "double");
  if (text.includes(".")) return makeNumeric(Number(text), "double");
  return makeNumeric(Number(text), "int");
}

function parseStringToFiniteNumber(raw: string, line: number): number {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new MoonChunkError("Cannot cast empty string to number.", line, 1);
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new MoonChunkError(
      `Cannot cast string "${raw}" to a finite number.`,
      line,
      1,
    );
  }
  return parsed;
}

function formatPrintValue(value: unknown): string {
  if (isNumericValue(value)) return stringifyValue(value);
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") return value;
  if (typeof value === "function") {
    const fn = value as { name?: string };
    return fn.name ? `[Function ${fn.name}]` : "[Function]";
  }
  if (typeof value === "object") {
    const seen = new WeakSet<object>();
    try {
      return JSON.stringify(
        value,
        (_key, nestedValue) => {
          if (
            nestedValue &&
            typeof nestedValue === "object" &&
            isNumericValue(nestedValue)
          ) {
            return stringifyValue(nestedValue);
          }
          if (typeof nestedValue === "function") {
            const nestedFn = nestedValue as { name?: string };
            return nestedFn.name
              ? `[Function ${nestedFn.name}]`
              : "[Function]";
          }
          if (nestedValue && typeof nestedValue === "object") {
            if (seen.has(nestedValue as object)) return "[Circular]";
            seen.add(nestedValue as object);
          }
          return nestedValue;
        },
        2,
      );
    } catch {
      return String(value);
    }
  }
  return stringifyValue(value);
}

function getTerminalNodes(
  nodes: TerminalNode[] | TerminalNode,
): TerminalNode[] {
  return Array.isArray(nodes) ? nodes : [nodes];
}

function paramsFromList(
  parameterList?: ParameterListContext,
): RuntimeParameter[] {
  if (!parameterList) return [];
  return parameterList.parameter().map((param: ParameterContext) => ({
    name: param.identifierAtom().text,
    declaredType: param.typeName() ? param.typeName()!.text : null,
  }));
}

class ExprEvaluator {
  constructor(
    private readonly scope: Scope,
    private readonly cwd: string,
    private readonly line: number,
    private readonly helpers: RuntimeHelpers,
  ) {}

  evaluateFragment(ctx: ExpressionFragmentContext): unknown {
    return this.evaluateExpression(ctx.expression());
  }

  evaluateExpression(ctx: ExpressionContext): unknown {
    return this.evaluateAssignment(ctx.assignment());
  }

  private evaluateAssignment(ctx: AssignmentContext): unknown {
    if (ctx.ASSIGN()) {
      const target = ctx.identifierPath();
      const value = this.evaluateAssignment(ctx.assignment()!);
      if (!target)
        throw new MoonChunkError("Invalid assignment target.", this.line, 1);
      this.assignIdentifierPath(target, value);
      return value;
    }
    return this.evaluateConditional(ctx.conditionalExpr()!);
  }

  private evaluateConditional(ctx: ConditionalExprContext): unknown {
    const cond = this.evaluateOr(ctx.orExpr());
    if (!ctx.QUESTION()) return cond;
    if (!ctx.expression() || !ctx.conditionalExpr()) {
      throw new MoonChunkError("Invalid ternary expression.", this.line, 1);
    }
    return cond
      ? this.evaluateExpression(ctx.expression()!)
      : this.evaluateConditional(ctx.conditionalExpr()!);
  }

  private evaluateOr(ctx: OrExprContext): unknown {
    const parts = ctx.andExpr();
    let current = this.evaluateAnd(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const right = this.evaluateAnd(parts[i]);
      if (typeof current !== "boolean" || typeof right !== "boolean") {
        throw new MoonChunkError("or expects bool operands.", this.line, 1);
      }
      current = current || right;
    }
    return current;
  }

  private evaluateAnd(ctx: AndExprContext): unknown {
    const parts = ctx.equalityExpr();
    let current = this.evaluateEquality(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const right = this.evaluateEquality(parts[i]);
      if (typeof current !== "boolean" || typeof right !== "boolean") {
        throw new MoonChunkError("and expects bool operands.", this.line, 1);
      }
      current = current && right;
    }
    return current;
  }

  private evaluateEquality(ctx: EqualityExprContext): unknown {
    const parts = ctx.comparisonExpr();
    const ops = getTerminalNodes(ctx.EQ())
      .map(() => "==")
      .concat(getTerminalNodes(ctx.NEQ()).map(() => "!="));
    if (parts.length === 1) return this.evaluateComparison(parts[0]);

    const orderedOps: string[] = [];
    for (let i = 1; i < ctx.childCount; i += 1) {
      const text = ctx.getChild(i).text;
      if (text === "==" || text === "!=") orderedOps.push(text);
    }

    let current = this.evaluateComparison(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const op = orderedOps[i - 1] || ops[i - 1];
      const right = this.evaluateComparison(parts[i]);
      let eq = false;
      if (
        (isNumericValue(current) || typeof current === "number") &&
        (isNumericValue(right) || typeof right === "number")
      ) {
        const a = coerceToNumeric(current, this.line);
        const b = coerceToNumeric(right, this.line);
        eq = a.value === b.value;
      } else {
        eq = current === right;
      }
      current = op === "==" ? eq : !eq;
    }
    return current;
  }

  private evaluateComparison(ctx: ComparisonExprContext): unknown {
    const parts = ctx.additiveExpr();
    if (parts.length === 1) return this.evaluateAdditive(parts[0]);

    const ops: string[] = [];
    for (let i = 1; i < ctx.childCount; i += 1) {
      const text = ctx.getChild(i).text;
      if (text === "<" || text === ">" || text === "<=" || text === ">=")
        ops.push(text);
    }

    let current = this.evaluateAdditive(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const op = ops[i - 1];
      const a = coerceToNumeric(current, this.line);
      const b = coerceToNumeric(this.evaluateAdditive(parts[i]), this.line);
      if (op === "<") current = a.value < b.value;
      if (op === ">") current = a.value > b.value;
      if (op === "<=") current = a.value <= b.value;
      if (op === ">=") current = a.value >= b.value;
    }
    return current;
  }

  private evaluateAdditive(ctx: AdditiveExprContext): unknown {
    const parts = ctx.multiplicativeExpr();
    if (parts.length === 1) return this.evaluateMultiplicative(parts[0]);

    const ops: string[] = [];
    for (let i = 1; i < ctx.childCount; i += 1) {
      const text = ctx.getChild(i).text;
      if (text === "+" || text === "-") ops.push(text);
    }

    let current = this.evaluateMultiplicative(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const op = ops[i - 1];
      const right = this.evaluateMultiplicative(parts[i]);
      if (op === "+") {
        if (typeof current === "string" || typeof right === "string") {
          current = `${stringifyValue(current)}${stringifyValue(right)}`;
        } else if (
          (isNumericValue(current) || typeof current === "number") &&
          (isNumericValue(right) || typeof right === "number")
        ) {
          const a = coerceToNumeric(current, this.line);
          const b = coerceToNumeric(right, this.line);
          current = makeNumeric(
            a.value + b.value,
            promoteNumericType(a.numType, b.numType),
          );
        } else {
          current = `${stringifyValue(current)}${stringifyValue(right)}`;
        }
      } else {
        const a = coerceToNumeric(current, this.line);
        const b = coerceToNumeric(right, this.line);
        current = makeNumeric(
          a.value - b.value,
          promoteNumericType(a.numType, b.numType),
        );
      }
    }
    return current;
  }

  private evaluateMultiplicative(ctx: MultiplicativeExprContext): unknown {
    const parts = ctx.castExpr();
    if (parts.length === 1) return this.evaluateCastExpr(parts[0]);

    const ops: string[] = [];
    for (let i = 1; i < ctx.childCount; i += 1) {
      const text = ctx.getChild(i).text;
      if (text === "*" || text === "/" || text === "%") ops.push(text);
    }

    let current = this.evaluateCastExpr(parts[0]);
    for (let i = 1; i < parts.length; i += 1) {
      const op = ops[i - 1];
      const a = coerceToNumeric(current, this.line);
      const b = coerceToNumeric(this.evaluateCastExpr(parts[i]), this.line);
      if (op === "*") {
        current = makeNumeric(
          a.value * b.value,
          promoteNumericType(a.numType, b.numType),
        );
      } else if (op === "/") {
        if (b.value === 0) {
          throw new MoonChunkError("Division by zero.", this.line, 1);
        }
        if (a.numType === "int" && b.numType === "int") {
          current = makeNumeric(Math.trunc(a.value / b.value), "int");
        } else {
          current = makeNumeric(
            a.value / b.value,
            promoteNumericType(a.numType, b.numType),
          );
        }
      } else {
        if (b.value === 0) {
          throw new MoonChunkError("Modulo by zero.", this.line, 1);
        }
        if (a.numType === "int" && b.numType === "int") {
          current = makeNumeric(a.value % b.value, "int");
        } else {
          current = makeNumeric(
            a.value % b.value,
            promoteNumericType(a.numType, b.numType),
          );
        }
      }
    }
    return current;
  }

  private evaluateUnary(ctx: UnaryExprContext): unknown {
    if (ctx.NOT()) {
      const value = this.evaluateUnary(ctx.unaryExpr()!);
      if (typeof value !== "boolean") {
        throw new MoonChunkError(
          `Operator not expects bool, got ${inferType(value)}.`,
          this.line,
          1,
        );
      }
      return !value;
    }
    if (ctx.MINUS()) {
      const numeric = coerceToNumeric(
        this.evaluateUnary(ctx.unaryExpr()!),
        this.line,
      );
      return makeNumeric(-numeric.value, numeric.numType);
    }
    if (ctx.PLUS()) {
      const numeric = coerceToNumeric(
        this.evaluateUnary(ctx.unaryExpr()!),
        this.line,
      );
      return makeNumeric(numeric.value, numeric.numType);
    }
    return this.evaluateCallExpr(ctx.callExpr()!);
  }

  private castToType(value: unknown, typeName: string): unknown {
    if (typeName === "unknown" || typeName === "any") {
      return {
        __kind: "cast_box",
        castType: typeName,
        value,
      } as CastBox;
    }

    const rawValue = isCastBox(value) ? value.value : value;
    const fromBridge = isCastBox(value);
    const rawType = inferType(rawValue);

    if (
      (typeName === "int" || typeName === "float" || typeName === "double") &&
      (rawType === "int" || rawType === "float" || rawType === "double")
    ) {
      const numeric = coerceToNumeric(rawValue, this.line);
      return makeNumeric(numeric.value, typeName);
    }
    if (typeName === "number" && (rawType === "int" || rawType === "float" || rawType === "double")) {
      const numeric = coerceToNumeric(rawValue, this.line);
      return makeNumeric(numeric.value, "double");
    }
    if (typeName === "string" && rawType === "string") {
      return rawValue;
    }
    if (typeName === "bool" && rawType === "bool") {
      return rawValue;
    }

    if (typeName === "string") {
      return stringifyValue(rawValue);
    }

    if (typeName === "bool") {
      if (typeof rawValue === "boolean") return rawValue;
      if (!fromBridge) {
        throw new MoonChunkError(
          "Direct cast to bool is not allowed. Use `as unknown as bool` or `as any as bool`.",
          this.line,
          1,
        );
      }
      if (isNumericValue(rawValue) || typeof rawValue === "number") {
        const numeric = coerceToNumeric(rawValue, this.line);
        return numeric.value > 0;
      }
      return Boolean(rawValue);
    }

    if (typeName === "int" || typeName === "float" || typeName === "double") {
      if (typeof rawValue === "boolean") {
        return makeNumeric(rawValue ? 1 : 0, typeName);
      }
      if (typeof rawValue === "string") {
        return makeNumeric(parseStringToFiniteNumber(rawValue, this.line), typeName);
      }
      const numeric = coerceToNumeric(rawValue, this.line);
      return makeNumeric(numeric.value, typeName);
    }

    if (typeName === "number") {
      if (typeof rawValue === "boolean") {
        return makeNumeric(rawValue ? 1 : 0, "double");
      }
      if (typeof rawValue === "string") {
        return makeNumeric(parseStringToFiniteNumber(rawValue, this.line), "double");
      }
      const numeric = coerceToNumeric(rawValue, this.line);
      return makeNumeric(numeric.value, "double");
    }

    if (typeName === "array") {
      if (!Array.isArray(rawValue)) {
        throw new MoonChunkError("Cast target type array expects an array value.", this.line, 1);
      }
      return rawValue;
    }

    if (typeName === "object") {
      if (
        rawValue === null ||
        typeof rawValue !== "object" ||
        Array.isArray(rawValue)
      ) {
        throw new MoonChunkError("Cast target type object expects a non-array object value.", this.line, 1);
      }
      return rawValue;
    }

    if (typeName === "null") {
      if (rawValue !== null) {
        throw new MoonChunkError("Cast target type null expects a null value.", this.line, 1);
      }
      return null;
    }

    if (typeName === "undefined" || typeName === "void") {
      if (rawValue !== undefined) {
        throw new MoonChunkError("Cast target type undefined expects an undefined value.", this.line, 1);
      }
      return undefined;
    }

    throw new MoonChunkError(
      `Unsupported cast target type: ${typeName}.`,
      this.line,
      1,
    );
  }

  private evaluateCastExpr(ctx: CastExprContext): unknown {
    let current = this.evaluateUnary(ctx.unaryExpr());
    const castTypes = ctx.typeName();
    for (const castType of castTypes) {
      current = this.castToType(current, castType.text);
    }
    return current;
  }

  private evaluateCallExpr(ctx: CallExprContext): unknown {
    if (ctx.nonCallablePrimary()) {
      return this.evaluateNonCallablePrimary(ctx.nonCallablePrimary()!);
    }

    let current = this.evaluateCallablePrimary(ctx.callablePrimary()!);
    const leftParens = getTerminalNodes(ctx.LPAREN());
    const rightParens = getTerminalNodes(ctx.RPAREN());
    const argumentLists = ctx.argumentList();

    let argIndex = 0;
    for (let i = 0; i < leftParens.length; i += 1) {
      const l = leftParens[i].symbol.startIndex;
      const r = rightParens[i].symbol.stopIndex;
      let args: unknown[] = [];
      if (argIndex < argumentLists.length) {
        const candidate = argumentLists[argIndex];
        if (
          candidate.start.startIndex > l &&
          candidate.stop &&
          candidate.stop.stopIndex < r
        ) {
          args = candidate
            .expression()
            .map((exp) => this.evaluateExpression(exp));
          argIndex += 1;
        }
      }
      current = this.applyCall(current, args);
    }

    return current;
  }

  private evaluateCallablePrimary(ctx: CallablePrimaryContext): unknown {
    if (ctx.arrowFunctionExpr())
      return this.createArrowFunction(ctx.arrowFunctionExpr()!);
    if (ctx.functionExpr())
      return this.createFunctionExpression(ctx.functionExpr()!);
    if (ctx.identifierPath())
      return this.resolveIdentifierPath(ctx.identifierPath()!);
    throw new MoonChunkError("Invalid callable primary.", this.line, 1);
  }

  private evaluateNonCallablePrimary(ctx: NonCallablePrimaryContext): unknown {
    if (ctx.STRING()) return parseQuotedString(ctx.STRING()!.text);
    if (ctx.NUMBER()) return parseNumberLiteral(ctx.NUMBER()!.text);
    if (ctx.TRUE()) return true;
    if (ctx.FALSE()) return false;
    if (ctx.TYPE_NULL()) return null;
    if (ctx.TYPE_UNDEFINED()) return undefined;
    if (ctx.identifierAtom())
      return this.resolveIdentifierAtom(ctx.identifierAtom()!);
    if (ctx.arrayLiteral()) return this.evaluateArrayLiteral(ctx.arrayLiteral()!);
    if (ctx.objectLiteral())
      return this.evaluateObjectLiteral(ctx.objectLiteral()!);
    if (ctx.expression()) return this.evaluateExpression(ctx.expression()!);
    throw new MoonChunkError("Unsupported expression primary.", this.line, 1);
  }

  private evaluateArrayLiteral(ctx: ArrayLiteralContext): unknown[] {
    return ctx.expression().map((expression) =>
      this.evaluateExpression(expression),
    );
  }

  private evaluateObjectLiteral(ctx: ObjectLiteralContext): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const property of ctx.objectProperty()) {
      const [key, value] = this.evaluateObjectProperty(property);
      out[key] = value;
    }
    return out;
  }

  private evaluateObjectProperty(ctx: ObjectPropertyContext): [string, unknown] {
    const rawKey = ctx.getChild(0)?.text ?? "";
    const key =
      rawKey.startsWith('"') && rawKey.endsWith('"')
        ? parseQuotedString(rawKey)
        : rawKey;
    const value = this.evaluateExpression(ctx.expression());
    return [String(key), value];
  }

  private resolveIdentifierAtom(ctx: IdentifierAtomContext): unknown {
    return this.resolveIdentifierName(ctx.text);
  }

  private createFunctionExpression(ctx: FunctionExprContext): RuntimeCallable {
    const params = paramsFromList(ctx.parameterList());
    const returnType = ctx.returnTypeName() ? ctx.returnTypeName()!.text : null;
    const bodyStatements = ctx.functionBodyStatement();
    const closure = this.scope;

    return makeCallable(
      params,
      returnType,
      (args: unknown[], callLine: number) => {
        const fnScope = closure.deriveBoundary();
        this.bindParams(fnScope, params, args, callLine);
        const result = this.runFunctionBodyStatements(
          bodyStatements,
          fnScope,
          callLine,
        );
        this.ensureReturnType(returnType, result, callLine);
        return result;
      },
    );
  }

  private createArrowFunction(ctx: ArrowFunctionExprContext): RuntimeCallable {
    const shortParam = ctx.identifierAtom();
    const params = shortParam
      ? [
          {
            name: shortParam.text,
            declaredType: ctx.returnTypeName()
              ? ctx.returnTypeName()!.text
              : null,
          },
        ]
      : paramsFromList(ctx.parameterList());
    const returnType = ctx.returnTypeName() ? ctx.returnTypeName()!.text : null;
    const body = ctx.arrowFunctionBody();
    const closure = this.scope;

    return makeCallable(
      params,
      returnType,
      (args: unknown[], callLine: number) => {
        const fnScope = closure.deriveBoundary();
        this.bindParams(fnScope, params, args, callLine);
        let result: unknown = null;
        if (body.expression()) {
          result = this.evaluateExpressionInScope(
            body.expression()!,
            fnScope,
            callLine,
          );
        } else {
          result = this.runFunctionBodyStatements(
            body.functionBodyStatement(),
            fnScope,
            callLine,
          );
        }
        this.ensureReturnType(returnType, result, callLine);
        return result;
      },
    );
  }

  private createArrowDeclarationCallable(
    ctx: ArrowFunctionDeclarationContext,
  ): RuntimeCallable {
    const params = paramsFromList(ctx.parameterList());
    const returnType = ctx.returnTypeName() ? ctx.returnTypeName()!.text : null;
    const body = ctx.arrowFunctionBody();
    const closure = this.scope;

    return makeCallable(
      params,
      returnType,
      (args: unknown[], callLine: number) => {
        const fnScope = closure.deriveBoundary();
        this.bindParams(fnScope, params, args, callLine);
        let result: unknown = null;
        if (body.expression()) {
          result = this.evaluateExpressionInScope(
            body.expression()!,
            fnScope,
            callLine,
          );
        } else {
          result = this.runFunctionBodyStatements(
            body.functionBodyStatement(),
            fnScope,
            callLine,
          );
        }
        this.ensureReturnType(returnType, result, callLine);
        return result;
      },
      ctx.identifierAtom().text,
    );
  }

  private createFunctionDeclarationCallable(
    ctx: FunctionDeclarationContext,
  ): RuntimeCallable {
    const params = paramsFromList(ctx.parameterList());
    const returnType = ctx.returnTypeName() ? ctx.returnTypeName()!.text : null;
    const bodyStatements = ctx.functionBodyStatement();
    const closure = this.scope;

    return makeCallable(
      params,
      returnType,
      (args: unknown[], callLine: number) => {
        const fnScope = closure.deriveBoundary();
        this.bindParams(fnScope, params, args, callLine);
        const result = this.runFunctionBodyStatements(
          bodyStatements,
          fnScope,
          callLine,
        );
        this.ensureReturnType(returnType, result, callLine);
        return result;
      },
      ctx.identifierAtom().text,
    );
  }

  private bindParams(
    scope: Scope,
    params: RuntimeParameter[],
    args: unknown[],
    line: number,
  ): void {
    for (let i = 0; i < params.length; i += 1) {
      const param = params[i];
      const arg = i < args.length ? args[i] : null;
      scope.declare(param.name, arg, param.declaredType, line);
    }
  }

  private runFunctionBodyStatements(
    statements: FunctionBodyStatementContext[],
    fnScope: Scope,
    callLine: number,
  ): unknown {
    try {
      for (const statement of statements) {
        this.executeFunctionBodyStatement(statement, fnScope, callLine);
      }
      return null;
    } catch (error) {
      if (error instanceof ReturnSignal) return error.value;
      throw error;
    }
  }

  private executeFunctionBodyStatement(
    statement: FunctionBodyStatementContext,
    fnScope: Scope,
    line: number,
    inLoop = false,
  ): void {
    if (statement.constStatement())
      return this.executeConstStatement(
        statement.constStatement()!,
        fnScope,
        line,
      );
    if (statement.functionDeclaration()) {
      const decl = statement.functionDeclaration()!;
      const callable = this.createFunctionDeclarationCallable(decl);
      fnScope.declare(decl.identifierAtom().text, callable, null, decl.start.line);
      return;
    }
    if (statement.letStatement())
      return this.executeLetStatement(statement.letStatement()!, fnScope, line);
    if (statement.arrowFunctionDeclaration()) {
      const decl = statement.arrowFunctionDeclaration()!;
      const callable = this.createArrowDeclarationCallable(decl);
      fnScope.declare(decl.identifierAtom().text, callable, null, decl.start.line);
      return;
    }
    if (statement.ifStatement())
      return this.executeIfStatement(
        statement.ifStatement()!,
        fnScope,
        line,
        inLoop,
      );
    if (statement.forStatement())
      return this.executeForStatement(statement.forStatement()!, fnScope, line);
    if (statement.whileStatement())
      return this.executeWhileStatement(
        statement.whileStatement()!,
        fnScope,
        line,
      );
    if (statement.breakStatement()) {
      if (!inLoop)
        throw new MoonChunkError(
          "break can only be used inside a loop.",
          statement.start.line,
          1,
        );
      throw new BreakSignal();
    }
    if (statement.continueStatement()) {
      if (!inLoop)
        throw new MoonChunkError(
          "continue can only be used inside a loop.",
          statement.start.line,
          1,
        );
      throw new ContinueSignal();
    }
    if (statement.returnStatement()) {
      const ret = statement.returnStatement()!;
      if (!ret.expression()) {
        throw new ReturnSignal(null);
      }
      throw new ReturnSignal(
        this.evaluateExpressionInScope(ret.expression()!, fnScope, ret.start.line),
      );
    }
    if (statement.expressionStatement()) {
      this.evaluateExpressionInScope(
        statement.expressionStatement()!.expression(),
        fnScope,
        statement.start.line,
      );
      return;
    }
  }

  private executeRuntimeChunkStatement(
    stmt: RuntimeChunkStatementContext,
    fnScope: Scope,
    line: number,
    inLoop = false,
  ): void {
    if (stmt.constStatement())
      return this.executeConstStatement(stmt.constStatement()!, fnScope, line);
    if (stmt.letStatement())
      return this.executeLetStatement(stmt.letStatement()!, fnScope, line);
    if (stmt.functionDeclaration()) {
      const decl = stmt.functionDeclaration()!;
      const callable = this.createFunctionDeclarationCallable(decl);
      fnScope.declare(decl.identifierAtom().text, callable, null, decl.start.line);
      return;
    }
    if (stmt.arrowFunctionDeclaration()) {
      const decl = stmt.arrowFunctionDeclaration()!;
      const callable = this.createArrowDeclarationCallable(decl);
      fnScope.declare(decl.identifierAtom().text, callable, null, decl.start.line);
      return;
    }
    if (stmt.ifStatement())
      return this.executeIfStatement(
        stmt.ifStatement()!,
        fnScope,
        line,
        inLoop,
      );
    if (stmt.forStatement())
      return this.executeForStatement(stmt.forStatement()!, fnScope, line);
    if (stmt.whileStatement())
      return this.executeWhileStatement(stmt.whileStatement()!, fnScope, line);
    if (stmt.breakStatement()) {
      if (!inLoop)
        throw new MoonChunkError(
          "break can only be used inside a loop.",
          stmt.start.line,
          1,
        );
      throw new BreakSignal();
    }
    if (stmt.continueStatement()) {
      if (!inLoop)
        throw new MoonChunkError(
          "continue can only be used inside a loop.",
          stmt.start.line,
          1,
        );
      throw new ContinueSignal();
    }
    if (stmt.returnStatement()) {
      const ret = stmt.returnStatement()!;
      if (!ret.expression()) {
        throw new ReturnSignal(null);
      }
      throw new ReturnSignal(
        this.evaluateExpressionInScope(ret.expression()!, fnScope, ret.start.line),
      );
    }
    if (stmt.expressionStatement()) {
      this.evaluateExpressionInScope(
        stmt.expressionStatement()!.expression(),
        fnScope,
        stmt.start.line,
      );
      return;
    }
    if (stmt.pageStatement()) {
      throw new MoonChunkError(
        "Page statements are not allowed in expression function runtime.",
        stmt.start.line,
        1,
      );
    }
  }

  private executeIfStatement(
    stmt: IfStatementContext,
    fnScope: Scope,
    line: number,
    inLoop = false,
  ): void {
    const cond = this.evaluateExpressionInScope(
      stmt.expression(),
      fnScope,
      line,
    );
    if (typeof cond !== "boolean") {
      throw new MoonChunkError("if condition must be bool.", stmt.start.line, 1);
    }
    const blocks = stmt.runtimeBlock();
    const selected = cond ? blocks[0] : blocks[1];
    if (!selected) return;
    const blockScope = fnScope.derive();
    for (const nested of selected.runtimeChunkStatement()) {
      this.executeRuntimeChunkStatement(nested, blockScope, line, inLoop);
    }
  }

  private executeForStatement(
    stmt: ForStatementContext,
    fnScope: Scope,
    line: number,
  ): void {
    const loopScope = fnScope.derive();
    const init = stmt.forInit();
    const initName = init.identifierAtom().text;

    const typeCtxRaw = (
      init as unknown as { typeName?: () => unknown }
    ).typeName?.();
    let initDeclaredType: string | null = null;
    if (Array.isArray(typeCtxRaw)) {
      initDeclaredType =
        typeCtxRaw.length > 0 ? (typeCtxRaw[0] as { text: string }).text : null;
    } else if (
      typeCtxRaw &&
      typeof typeCtxRaw === "object" &&
      "text" in typeCtxRaw
    ) {
      initDeclaredType = (typeCtxRaw as { text: string }).text;
    }

    const initValue = this.evaluateExpressionInScope(
      init.expression(),
      loopScope,
      init.start.line,
    );
    loopScope.declare(initName, initValue, initDeclaredType, init.start.line);

    while (true) {
      const cond = this.evaluateExpressionInScope(
        stmt.expression(),
        loopScope,
        line,
      );
      if (typeof cond !== "boolean") {
        throw new MoonChunkError(
          "for condition must be bool.",
          stmt.start.line,
          1,
        );
      }
      if (!cond) break;
      const iterScope = loopScope.derive();
      for (const nested of stmt.runtimeBlock().runtimeChunkStatement()) {
        try {
          this.executeRuntimeChunkStatement(nested, iterScope, line, true);
        } catch (error) {
          if (error instanceof ContinueSignal) break;
          if (error instanceof BreakSignal) return;
          throw error;
        }
      }

      this.evaluateExpressionInScope(
        stmt.forUpdate().expression(),
        loopScope,
        stmt.start.line,
      );
    }
  }

  private executeWhileStatement(
    stmt: WhileStatementContext,
    fnScope: Scope,
    line: number,
  ): void {
    const loopScope = fnScope.derive();
    while (true) {
      const cond = this.evaluateExpressionInScope(
        stmt.expression(),
        loopScope,
        line,
      );
      if (typeof cond !== "boolean") {
        throw new MoonChunkError(
          "while condition must be bool.",
          stmt.start.line,
          1,
        );
      }
      if (!cond) break;
      const iterScope = loopScope.derive();
      for (const nested of stmt.runtimeBlock().runtimeChunkStatement()) {
        try {
          this.executeRuntimeChunkStatement(nested, iterScope, line, true);
        } catch (error) {
          if (error instanceof ContinueSignal) break;
          if (error instanceof BreakSignal) return;
          throw error;
        }
      }
    }
  }

  private executeConstStatement(
    stmt: ConstStatementContext,
    fnScope: Scope,
    line: number,
  ): void {
    const value = this.evaluateExpressionInScope(
      stmt.expression(),
      fnScope,
      line,
    );
    fnScope.declare(
      stmt.identifierAtom().text,
      value,
      stmt.typeName() ? stmt.typeName()!.text : null,
      stmt.start.line,
      false,
    );
  }

  private executeLetStatement(
    stmt: LetStatementContext,
    fnScope: Scope,
    line: number,
  ): void {
    const value = this.evaluateExpressionInScope(
      stmt.expression(),
      fnScope,
      line,
    );
    fnScope.declare(
      stmt.identifierAtom().text,
      value,
      stmt.typeName() ? stmt.typeName()!.text : null,
      stmt.start.line,
    );
  }

  private evaluateExpressionInScope(
    expression: ExpressionContext,
    scope: Scope,
    line: number,
  ): unknown {
    const nested = new ExprEvaluator(scope, this.cwd, line, this.helpers);
    return nested.evaluateExpression(expression);
  }

  private ensureReturnType(
    declaredType: string | null,
    value: unknown,
    line: number,
  ): void {
    if (!declaredType) return;
    const actual = inferType(value);
    if (!isAssignable(declaredType, actual)) {
      throw new MoonChunkError(
        `Type mismatch: declared ${declaredType}, got ${actual}.`,
        line,
        1,
      );
    }
  }

  private applyCall(target: unknown, args: unknown[]): unknown {
    if (isCallable(target)) {
      return target.invoke(args, this.line);
    }
    throw new MoonChunkError(
      `Value is not callable: ${inferType(target)}.`,
      this.line,
      1,
    );
  }

  private resolveIdentifierName(name: string): unknown {
    let value: unknown = this.scope.get(name);
    if (value === undefined) value = this.helpers.getGlobal(name, this.line);
    if (value === undefined) value = this.getBuiltin(name);
    if (value === undefined) {
      throw new MoonChunkError(`Unknown variable: ${name}`, this.line, 1);
    }
    return value;
  }

  private resolveIdentifierPath(ctx: IdentifierPathContext): unknown {
    const rootName = ctx.getChild(0)?.text;
    if (!rootName) {
      throw new MoonChunkError("Invalid path.", this.line, 1);
    }
    const root = this.resolveIdentifierName(rootName);
    const steps = this.extractPathSteps(ctx);

    let current: unknown = root;
    for (const step of steps) {
      if (current === null || current === undefined) {
        const accessor = step.kind === "prop" ? step.key : `[${String(step.key)}]`;
        throw new MoonChunkError(
          `Cannot read property ${accessor} of ${current === null ? "null" : "undefined"}.`,
          this.line,
          1,
        );
      }
      if (!this.isPropertyContainer(current)) {
        return undefined;
      }
      if (step.kind === "prop") {
        current = (current as Record<string, unknown>)[step.key];
      } else {
        const key = this.normalizeIndexKey(step.key);
        current = (current as Record<string | number, unknown>)[key];
      }
    }
    return current;
  }

  private assignIdentifierPath(
    ctx: IdentifierPathContext,
    value: unknown,
  ): void {
    const rootName = ctx.getChild(0)?.text;
    if (!rootName)
      throw new MoonChunkError("Invalid assignment path.", this.line, 1);
    const steps = this.extractPathSteps(ctx);
    if (steps.length === 0) {
      this.scope.assign(rootName, value, this.line);
      return;
    }

    const root = this.scope.get(rootName);
    if (root === undefined) {
      throw new MoonChunkError(
        `Cannot assign path on unknown variable: ${rootName}`,
        this.line,
        1,
      );
    }

    let current: unknown = root;
    for (let i = 0; i < steps.length - 1; i += 1) {
      const step = steps[i];
      const seg = step.kind === "prop" ? step.key : `[${String(step.key)}]`;
      if (
        current === null ||
        current === undefined ||
        !this.isPropertyContainer(current)
      ) {
        throw new MoonChunkError(
          `Cannot assign path through non-object at segment ${seg}.`,
          this.line,
          1,
        );
      }
      if (step.kind === "prop") {
        current = (current as Record<string, unknown>)[step.key];
      } else {
        const key = this.normalizeIndexKey(step.key);
        current = (current as Record<string | number, unknown>)[key];
      }
    }

    if (
      current === null ||
      current === undefined ||
      !this.isPropertyContainer(current)
    ) {
      throw new MoonChunkError(
        `Cannot assign to path ${ctx.text}.`,
        this.line,
        1,
      );
    }

    const last = steps[steps.length - 1];
    if (last.kind === "prop") {
      (current as Record<string, unknown>)[last.key] = value;
      return;
    }
    const key = this.normalizeIndexKey(last.key);
    (current as Record<string | number, unknown>)[key] = value;
  }

  private normalizeIndexKey(value: unknown): string | number {
    if (isNumericValue(value)) return String(value.value);
    if (typeof value === "number") return String(value);
    if (typeof value === "string") return value;
    if (typeof value === "boolean") return String(value);
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    throw new MoonChunkError(
      `Invalid bracket index type: ${inferType(value)}.`,
      this.line,
      1,
    );
  }

  private extractPathSteps(ctx: IdentifierPathContext): PathStep[] {
    const steps: PathStep[] = [];
    const indexExpressions = ctx.expression();
    let indexExprCursor = 0;

    for (let i = 1; i < ctx.childCount; i += 1) {
      const token = ctx.getChild(i).text;
      if (token === ".") {
        const next = ctx.getChild(i + 1)?.text;
        if (!next) break;
        steps.push({ kind: "prop", key: next });
        i += 1;
        continue;
      }
      if (token === "[") {
        const expr = indexExpressions[indexExprCursor];
        if (!expr) {
          throw new MoonChunkError("Invalid bracket access syntax.", this.line, 1);
        }
        steps.push({ kind: "index", key: this.evaluateExpression(expr) });
        indexExprCursor += 1;
      }
    }
    return steps;
  }

  private isPropertyContainer(
    value: unknown,
  ): value is Record<string | number, unknown> {
    if (value === null || value === undefined) return false;
    if (isNumericValue(value)) return false;
    return typeof value === "object" || typeof value === "function";
  }

  private getBuiltin(name: string): unknown {
    if (name === "data") {
      return makeCallable(
        [{ name: "path", declaredType: "string" }],
        null,
        (args: unknown[], line: number) => {
          if (args.length !== 1) {
            throw new MoonChunkError(
              "data(...) expects exactly one argument.",
              line,
              1,
            );
          }
          if (typeof args[0] !== "string") {
            throw new MoonChunkError("data(...) expects a string path.", line, 1);
          }
          const abs = path.resolve(this.cwd, args[0]);
          if (!fs.existsSync(abs)) {
            throw new MoonChunkError(
              `Data file does not exist: ${args[0]}`,
              line,
              1,
            );
          }
          return normalizeJsonNumbers(JSON.parse(fs.readFileSync(abs, "utf8")));
        },
        "data",
      );
    }

    if (name === "print") {
      return makeCallable([], null, (args: unknown[]) => {
        const output = args.map((arg) => formatPrintValue(arg)).join(" ");
        console.log(output);
        return null;
      }, "print");
    }

    return undefined;
  }
}

export function evalExpr(
  rawExpr: string,
  scope: Scope,
  cwd: string,
  line = 1,
  helpers: RuntimeHelpers = NO_HELPERS,
): unknown {
  const expr = rawExpr.trim();
  if (!expr) return null;

  const input = CharStreams.fromString(expr);
  const lexer = new MoonChunkLexer(input);
  const tokens = new CommonTokenStream(lexer);
  const parser = new MoonChunkParser(tokens);

  const syntax = new SyntaxCollector();
  lexer.removeErrorListeners();
  parser.removeErrorListeners();
  lexer.addErrorListener(syntax);
  parser.addErrorListener(syntax);

  const tree = parser.expressionFragment();
  if (syntax.diagnostics.length > 0) {
    const first = syntax.diagnostics[0];
    throw new MoonChunkError(first.message, line, first.column);
  }

  const evaluator = new ExprEvaluator(scope, cwd, line, helpers);
  return evaluator.evaluateFragment(tree);
}

export type { RuntimeCallable, RuntimeParameter };
export { makeCallable, isCallable };
