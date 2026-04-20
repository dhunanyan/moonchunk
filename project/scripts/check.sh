#!/usr/bin/env sh
set -eu

sh scripts/build.sh
node ./scripts/check.js
