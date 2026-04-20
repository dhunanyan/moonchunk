#!/usr/bin/env node

const { executeMoonChunk } = require('../dist/index.js');

const result = executeMoonChunk('chunk "Check" {\n  output: "./dist";\n};');
if (!result.ok) {
  throw new Error('self-check failed');
}
console.log('self-check ok');
