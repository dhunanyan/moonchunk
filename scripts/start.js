#!/usr/bin/env node

const { executeMoonChunkFile } = require("../dist/index.js");

const filePath = process.argv[2];

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
};

const okTag = `${C.green}${C.bold}[ OK ]${C.reset}`;
const errTag = `${C.red}${C.bold}[ERR ]${C.reset}`;
const infoTag = `${C.blue}${C.bold}[INFO]${C.reset}`;

function normalizeDiagnosticMessage(message) {
  if (!message) return "Unknown MoonChunk error.";

  const compact = message.replace(/\s+/g, " ").trim();
  const lower = compact.toLowerCase();

  const tokenRec = message.match(/^token recognition error at:\s*(.+)$/i);
  if (tokenRec) {
    return `Lexical error: unexpected character sequence ${tokenRec[1]}.`;
  }

  const noViable = compact.match(/^no viable alternative at input (.+)$/i);
  if (noViable) {
    return `Syntax error near ${noViable[1]}. Check separators, quotes, and brackets.`;
  }

  const extraneous = compact.match(
    /^extraneous input '(.+?)' expecting (.+)$/i,
  );
  if (extraneous) {
    const got = extraneous[1];
    const expecting = extraneous[2];
    if (got === ";") {
      return "Syntax error: unexpected semicolon. Remove it or fix the previous statement.";
    }
    if (got === "}" && /SEMI|;/.test(expecting)) {
      return "Syntax error: missing ';' before '}'.";
    }
    if (got === ")" && /SEMI|;/.test(expecting)) {
      return "Syntax error: missing ';' before ')'.";
    }
    return `Syntax error: unexpected token '${got}' in this context.`;
  }

  const mismatched = compact.match(
    /^mismatched input '(.+?)' expecting (.+)$/i,
  );
  if (mismatched) {
    const got = mismatched[1];
    const expecting = mismatched[2];

    if (got === "=" && /EQ|==/.test(expecting)) {
      return "Invalid assignment inside expression. Use '==' for comparison.";
    }
    if (got === ")" && /SEMI|;/.test(expecting)) {
      return "Missing ';' before ')'.";
    }
    if (got === "}" && /SEMI|;/.test(expecting)) {
      return "Missing ';' before '}'.";
    }
    if (got === "<EOF>") {
      return "Syntax error: unexpected end of file. Check for unclosed block, parenthesis, or statement.";
    }
    return `Syntax error: invalid token '${got}' for this expression/statement.`;
  }

  const missing = compact.match(/^missing '(.+?)' at (.+)$/i);
  if (missing) {
    return `Syntax error: missing required token '${missing[1]}' near ${missing[2]}.`;
  }

  // Runtime errors
  let m = compact.match(/^Unknown variable:\s*(.+)$/i);
  if (m)
    return `Runtime error: variable '${m[1]}' is not declared in the current scope.`;

  m = compact.match(/^Cannot reassign const variable:\s*(.+)$/i);
  if (m)
    return `Runtime error: cannot reassign const variable '${m[1]}'. Use 'let' if mutation is required.`;

  m = compact.match(
    /^Type mismatch for\s+(.+?): declared (.+?), got (.+?)\.?$/i,
  );
  if (m) {
    return `Type error: '${m[1]}' expects type '${m[2]}', but received '${m[3]}'.`;
  }

  m = compact.match(/^Type mismatch: declared (.+?), got (.+?)\.?$/i);
  if (m) {
    return `Type error: expected '${m[1]}', but got '${m[2]}'.`;
  }

  if (lower === "division by zero.")
    return "Math error: division by zero is not allowed.";
  if (lower === "modulo by zero.")
    return "Math error: modulo by zero is not allowed.";

  m = compact.match(/^Expected numeric value, got (.+?)\.?$/i);
  if (m) return `Type error: numeric value expected, but got '${m[1]}'.`;

  if (lower.startsWith("value is not callable:")) {
    const match = compact.match(/^Value is not callable:\s*(.+?)\.?$/i);
    return `Runtime error: attempted to call a non-function value${
      match ? ` of type '${match[1]}'` : ""
    }.`;
  }

  if (lower.includes("break can only be used inside a loop")) {
    return "Control-flow error: 'break' can only be used inside a loop.";
  }
  if (lower.includes("continue can only be used inside a loop")) {
    return "Control-flow error: 'continue' can only be used inside a loop.";
  }

  m = compact.match(/^Imported file does not exist:\s*(.+)$/i);
  if (m) return `Import error: file '${m[1]}' was not found.`;

  m = compact.match(/^Imported file must use \.mncnk extension\.$/i);
  if (m) return "Import error: only '.mncnk' files can be imported.";

  m = compact.match(/^Imported chunk "(.+?)" not found in (.+?)\.$/i);
  if (m) return `Import error: chunk '${m[1]}' was not found in '${m[2]}'.`;

  m = compact.match(/^Imported chunk "(.+?)" is not exported in (.+?)\.$/i);
  if (m)
    return `Import error: chunk '${m[1]}' in '${m[2]}' must be exported before import/use.`;

  m = compact.match(/^Circular import detected:\s*(.+)$/i);
  if (m) return `Import error: circular import detected (${m[1]}).`;

  m = compact.match(/^Chunk "(.+?)" is not available in namespace "(.+?)"\.$/i);
  if (m)
    return `Import error: namespace '${m[2]}' does not expose chunk '${m[1]}'.`;

  m = compact.match(/^Unknown import namespace in @include:\s*(.+?)\.$/i);
  if (m)
    return `Include error: unknown namespace '${m[1]}' in @include target.`;

  m = compact.match(/^Chunk "(.+?)" not found\.$/i);
  if (m)
    return `Include error: chunk '${m[1]}' not found in local scope or imports.`;

  if (lower.includes("circular chunk include detected")) {
    return "Include error: circular @include dependency detected.";
  }

  if (lower.includes("internal base template does not exist")) {
    return "Configuration error: internal base template file is missing.";
  }

  if (lower.includes("direct cast to bool is not allowed")) {
    return "Type-cast error: direct cast to 'bool' is not allowed. Use `as unknown as bool` or `as any as bool`.";
  }

  if (lower.startsWith("cannot cast empty string to number")) {
    return "Type-cast error: cannot cast empty string to number.";
  }
  if (
    lower.startsWith('cannot cast string "') &&
    lower.includes("to a finite number")
  ) {
    return compact.replace(/^Cannot cast/i, "Type-cast error: cannot cast");
  }
  if (lower.includes("cast target type array expects")) {
    return "Type-cast error: cast target 'array' requires an array value.";
  }
  if (lower.includes("cast target type object expects")) {
    return "Type-cast error: cast target 'object' requires a non-array object value.";
  }
  if (lower.includes("cast target type null expects")) {
    return "Type-cast error: cast target 'null' requires a null value.";
  }
  if (lower.includes("cast target type undefined expects")) {
    return "Type-cast error: cast target 'undefined' requires an undefined value.";
  }
  if (lower.startsWith("unsupported cast target type:")) {
    return `Type-cast error: ${compact}`;
  }

  return compact;
}

if (!filePath) {
  console.error(`${errTag} Missing input file.`);
  console.error("Usage: yarn start <path/to/file.mncnk>");
  process.exit(1);
}

const r = executeMoonChunkFile(filePath);

if (!r.ok) {
  const d = (r.diagnostics && r.diagnostics[0]) || {
    message: "Unknown error",
    line: 1,
    column: 1,
  };
  const msg = normalizeDiagnosticMessage(d.message);
  console.error(`${errTag} MoonChunk execution failed.`);
  console.error(`${infoTag} File: ${filePath}`);
  console.error(`${infoTag} ${msg} (${d.line}:${d.column})`);
  process.exit(1);
}

const files = Array.isArray(r.generatedFiles) ? r.generatedFiles : [];
console.log(`${okTag} MoonChunk generation completed.`);
if (files.length === 0) {
  console.log(`${infoTag} No files were generated.`);
} else {
  console.log(`${infoTag} Generated files:`);
  for (const f of files) {
    console.log(`  ${C.green}- ${C.bold}${f}${C.reset}`);
  }
}
