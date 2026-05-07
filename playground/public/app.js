const editor = document.getElementById('editor');
const runBtn = document.getElementById('runBtn');
const diagnosticsEl = document.getElementById('diagnostics');
const logsEl = document.getElementById('logs');
const generatedEl = document.getElementById('generated');
const previewEl = document.getElementById('preview');

let currentVersion = -1;
let fromServerUpdate = false;
let dirty = false;

editor.addEventListener('input', () => {
  if (fromServerUpdate) return;
  dirty = true;
});

function renderDiagnostics(diagnostics) {
  if (!diagnostics || diagnostics.length === 0) {
    diagnosticsEl.textContent = 'No diagnostics.';
    return;
  }
  diagnosticsEl.textContent = diagnostics
    .map((d) => `[${d.line}:${d.column}] ${d.message}`)
    .join('\n');
}

function applyState(state) {
  renderDiagnostics(state.diagnostics || []);

  logsEl.textContent = (state.logs && state.logs.length > 0)
    ? state.logs.join('\n')
    : 'No logs.';

  generatedEl.textContent = (state.generatedFiles && state.generatedFiles.length > 0)
    ? state.generatedFiles.join('\n')
    : 'No generated files.';

  if (!dirty && typeof state.source === 'string' && editor.value !== state.source) {
    fromServerUpdate = true;
    editor.value = state.source;
    fromServerUpdate = false;
  }

  if (state.ok && state.previewUrl) {
    previewEl.src = state.previewUrl;
  } else {
    previewEl.srcdoc = '<!doctype html><html><body><p>Nothing to preview.</p></body></html>';
  }
}

async function fetchConfig() {
  const response = await fetch('/api/config');
  await response.json();
}

async function fetchState() {
  const response = await fetch('/api/state', { cache: 'no-store' });
  const payload = await response.json();

  if (typeof payload.version === 'number' && payload.version !== currentVersion) {
    currentVersion = payload.version;
    applyState(payload);
  }
}

async function run() {
  runBtn.disabled = true;
  runBtn.textContent = 'Saving...';

  try {
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: editor.value }),
    });

    const payload = await response.json();
    dirty = false;
    if (typeof payload.version === 'number') {
      currentVersion = payload.version;
    }
    applyState(payload);
  } catch (error) {
    diagnosticsEl.textContent = `Request failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = 'Save & Run';
  }
}

runBtn.addEventListener('click', run);

async function bootstrap() {
  await fetchConfig();
  await fetchState();

  setInterval(() => {
    fetchState().catch(() => {
      // keep polling even if one request fails
    });
  }, 700);
}

bootstrap().catch((error) => {
  diagnosticsEl.textContent = `Startup failed: ${error instanceof Error ? error.message : String(error)}`;
});
