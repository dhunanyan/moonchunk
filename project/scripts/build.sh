#!/usr/bin/env sh
set -eu

sh scripts/compile-antlr.sh
./node_modules/.bin/tsc -p tsconfig.json
