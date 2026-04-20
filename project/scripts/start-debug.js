#!/usr/bin/env node

const { executeMoonChunkFile } = require('../dist/index.js');

const filePath = process.argv[2];
if (!filePath) {
  console.error('Missing input file.');
  console.error('Usage: yarn start:debug <path/to/file.mncnk>');
  process.exit(1);
}

const result = executeMoonChunkFile(filePath);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
