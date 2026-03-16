node -e "const { executeMoonChunkFile } = require('./dist/index.js'); const r = executeMoonChunkFile(process.argv[1]); console.log(JSON.stringify(r,null,2));" "$1"
