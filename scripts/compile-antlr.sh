#!/usr/bin/env sh
set -eu

./node_modules/.bin/antlr4ts -visitor -o .antlr ./MoonChunkLexer.g4 ./MoonChunkParser.g4
