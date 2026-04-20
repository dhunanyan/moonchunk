#!/usr/bin/env node

const { executeMoonChunkFile } = require('../dist/index.js');

const filePath = process.argv[2];

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  blue: '\x1b[34m'
};

const okTag = `${C.green}${C.bold}[ OK ]${C.reset}`;
const errTag = `${C.red}${C.bold}[ERR ]${C.reset}`;
const infoTag = `${C.blue}${C.bold}[INFO]${C.reset}`;

function normalizeDiagnosticMessage(message) {
  if (!message) return 'Unknown MoonChunk error.';
  const tokenRec = message.match(/^token recognition error at:\s*(.+)$/i);
  if (tokenRec) {
    return `Unexpected character sequence ${tokenRec[1]}.`;
  }
  return message;
}

if (!filePath) {
  console.error(`${errTag} Missing input file.`);
  console.error('Usage: yarn start <path/to/file.mncnk>');
  process.exit(1);
}

const r = executeMoonChunkFile(filePath);

if (!r.ok) {
  const d = (r.diagnostics && r.diagnostics[0]) || { message: 'Unknown error', line: 1, column: 1 };
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
