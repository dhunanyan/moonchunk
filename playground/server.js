const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT_DIR = path.resolve(__dirname, "..");
const PLAYGROUND_DIR = path.resolve(__dirname);
const PUBLIC_DIR = path.resolve(PLAYGROUND_DIR, "public");
const CONFIG_PATH = path.resolve(PLAYGROUND_DIR, "moonchunk.config.json");

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {
      playground: {
        port: 4173,
        host: "127.0.0.1",
        entryFile: "site.mncnk",
        workdir: "./workdir",
        defaultRoute: "index.html",
      },
    };
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
}

const config = loadConfig();
const pg = config.playground || {};
const HOST = pg.host || "127.0.0.1";
const PORT = Number(pg.port || 4173);
const ENTRY_FILE = pg.entryFile || "site.mncnk";
const DEFAULT_ROUTE = pg.defaultRoute || "index.html";
const WORKDIR = path.resolve(PLAYGROUND_DIR, pg.workdir || "./workdir");
const ENTRY_ABS = path.resolve(WORKDIR, ENTRY_FILE);

const DIST_ENTRY = path.resolve(ROOT_DIR, "dist/index.js");
if (!fs.existsSync(DIST_ENTRY)) {
  console.error("[ERR ] Missing dist build. Run `yarn build` first.");
  process.exit(1);
}

const { executeMoonChunkFile } = require(DIST_ENTRY);

const DEFAULT_CODE = "";

const runtimeState = {
  version: 0,
  ok: false,
  diagnostics: [],
  logs: [],
  output: [],
  generatedFiles: [],
  previewFile: null,
  source: "",
  updatedAt: null,
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function text(
  res,
  statusCode,
  payload,
  contentType = "text/plain; charset=utf-8",
) {
  res.writeHead(statusCode, { "content-type": contentType });
  res.end(payload);
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 5 * 1024 * 1024) {
        reject(new Error("Payload too large."));
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function ensureInside(baseDir, targetPath) {
  const rel = path.relative(baseDir, targetPath);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function toRel(targetPath) {
  return path.relative(WORKDIR, targetPath).replaceAll("\\\\", "/");
}

function buildPreviewUrl() {
  if (!runtimeState.previewFile) return null;
  return `/preview?file=${encodeURIComponent(runtimeState.previewFile)}&v=${
    runtimeState.version
  }`;
}

async function ensurePlaygroundFiles() {
  await fsp.mkdir(WORKDIR, { recursive: true });
  if (!fs.existsSync(ENTRY_ABS)) {
    await fsp.mkdir(path.dirname(ENTRY_ABS), { recursive: true });
    await fsp.writeFile(ENTRY_ABS, DEFAULT_CODE, "utf8");
  }
}

async function runCompilation() {
  const source = fs.existsSync(ENTRY_ABS)
    ? fs.readFileSync(ENTRY_ABS, "utf8")
    : "";
  runtimeState.source = source;

  const capturedLogs = [];
  const originalLog = console.log;
  console.log = (...args) => {
    const line = args
      .map((value) =>
        typeof value === "string" ? value : JSON.stringify(value),
      )
      .join(" ");
    capturedLogs.push(line);
    originalLog(...args);
  };

  let result;
  try {
    result = executeMoonChunkFile(ENTRY_ABS, {
      cwd: WORKDIR,
      writeFiles: true,
      formatHtml: true,
    });
  } finally {
    console.log = originalLog;
  }

  const generated = Array.isArray(result.generatedFiles)
    ? result.generatedFiles
    : [];
  const htmlFiles = generated.filter((absPath) =>
    String(absPath).endsWith(".html"),
  );

  let previewFile = null;
  if (htmlFiles.length > 0) {
    const preferred = htmlFiles.find((absPath) =>
      absPath.endsWith(path.sep + DEFAULT_ROUTE),
    );
    previewFile = toRel(preferred || htmlFiles[0]);
  }

  runtimeState.version += 1;
  runtimeState.ok = Boolean(result.ok);
  runtimeState.diagnostics = result.diagnostics || [];
  runtimeState.logs = capturedLogs;
  runtimeState.output = result.output || [];
  runtimeState.generatedFiles = generated.map((absPath) => toRel(absPath));
  runtimeState.previewFile = previewFile;
  runtimeState.updatedAt = new Date().toISOString();
}

let debounceTimer = null;
function scheduleCompilation() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    runCompilation().catch((error) => {
      runtimeState.version += 1;
      runtimeState.ok = false;
      runtimeState.diagnostics = [
        {
          message:
            error instanceof Error ? error.message : "Unknown compile error.",
          line: 1,
          column: 1,
        },
      ];
      runtimeState.logs = [];
      runtimeState.output = [];
      runtimeState.generatedFiles = [];
      runtimeState.previewFile = null;
      runtimeState.updatedAt = new Date().toISOString();
    });
  }, 120);
}

function watchWorkdir() {
  try {
    fs.watch(WORKDIR, { recursive: true }, (_eventType, fileName) => {
      if (!fileName) return;
      if (!/\.(mncnk|json)$/i.test(fileName)) return;
      scheduleCompilation();
    });
  } catch {
    fs.watchFile(ENTRY_ABS, { interval: 300 }, () => scheduleCompilation());
  }
}

async function handleRun(req, res) {
  try {
    const bodyRaw = await readBody(req);
    const payload = bodyRaw ? JSON.parse(bodyRaw) : {};
    if (typeof payload.code === "string") {
      await fsp.writeFile(ENTRY_ABS, payload.code, "utf8");
    }
    await runCompilation();
    return json(res, 200, {
      ok: runtimeState.ok,
      diagnostics: runtimeState.diagnostics,
      logs: runtimeState.logs,
      output: runtimeState.output,
      generatedFiles: runtimeState.generatedFiles,
      previewUrl: buildPreviewUrl(),
      version: runtimeState.version,
      source: runtimeState.source,
      entryFile: ENTRY_FILE,
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown server error.",
    });
  }
}

function handleState(_reqUrl, res) {
  return json(res, 200, {
    ok: runtimeState.ok,
    diagnostics: runtimeState.diagnostics,
    logs: runtimeState.logs,
    output: runtimeState.output,
    generatedFiles: runtimeState.generatedFiles,
    previewUrl: buildPreviewUrl(),
    version: runtimeState.version,
    source: runtimeState.source,
    updatedAt: runtimeState.updatedAt,
    entryFile: ENTRY_FILE,
  });
}

async function handlePreview(reqUrl, res) {
  const relFile = reqUrl.searchParams.get("file") || "";
  if (!relFile) return text(res, 400, "Missing file query parameter.");

  const absFile = path.resolve(WORKDIR, relFile);
  if (!ensureInside(WORKDIR, absFile))
    return text(res, 403, "Forbidden preview path.");
  if (!fs.existsSync(absFile)) return text(res, 404, "Preview file not found.");

  return text(res, 200, fs.readFileSync(absFile), getMime(absFile));
}

function handleStatic(reqUrl, res) {
  let pathname = reqUrl.pathname;
  if (pathname === "/") pathname = "/index.html";

  const abs = path.resolve(PUBLIC_DIR, `.${pathname}`);
  if (!ensureInside(PUBLIC_DIR, abs)) return text(res, 403, "Forbidden.");
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory())
    return text(res, 404, "Not found.");

  return text(res, 200, fs.readFileSync(abs), getMime(abs));
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || "/", `http://${HOST}:${PORT}`);

  if (req.method === "GET" && reqUrl.pathname === "/api/config") {
    return json(res, 200, {
      ok: true,
      config: {
        entryFile: ENTRY_FILE,
        entryPath: toRel(ENTRY_ABS),
        workdir: WORKDIR,
        defaultRoute: DEFAULT_ROUTE,
      },
    });
  }

  if (req.method === "GET" && reqUrl.pathname === "/api/state") {
    return handleState(reqUrl, res);
  }

  if (req.method === "POST" && reqUrl.pathname === "/api/run") {
    return handleRun(req, res);
  }

  if (req.method === "GET" && reqUrl.pathname === "/preview") {
    return handlePreview(reqUrl, res);
  }

  if (req.method === "GET") return handleStatic(reqUrl, res);
  return text(res, 405, "Method not allowed.");
});

(async () => {
  await ensurePlaygroundFiles();
  await runCompilation();
  watchWorkdir();

  server.listen(PORT, HOST, () => {
    console.log(
      `[ OK ] MoonChunk playground running at http://${HOST}:${PORT}`,
    );
    console.log(`[INFO] Watching: ${ENTRY_ABS}`);
  });
})();
