#!/usr/bin/env sh
set -eu

sh scripts/build.sh

node -e \"const { executeMoonChunk } = require('./dist/index.js'); const r = executeMoonChunk('chunk \\\"Check\\\" {\\n  output \\\"./dist\\\";\\n};'); if (!r.ok) { throw new Error('self-check failed'); } console.log('self-check ok');\"