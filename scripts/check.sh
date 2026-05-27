#!/usr/bin/env sh
set -eu

yarn build
node ./scripts/check.js
