#!/usr/bin/env sh
set -eu

sh scripts/compile-antlr.sh
tsc -p tsconfig.json
mkdir -p dist/moonchunk
cp moonchunk/base.tpl dist/moonchunk/base.tpl
