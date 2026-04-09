#!/usr/bin/env sh
set -eu

./node_modules/.bin/antlr4ts -visitor -o .antlr ./MoonChunk.g4
./node_modules/.bin/tsc -p tsconfig.json
