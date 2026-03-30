const vscode = acquireVsCodeApi();
const tabs = Array.from(document.querySelectorAll('.tab'));
const sections = Array.from(document.querySelectorAll('.section'));

function activateTab(target) {
  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === target);
  });
  sections.forEach((section) => {
    section.classList.toggle('active', section.dataset.section === target);
  });
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => activateTab(tab.dataset.tab));
});

document.querySelectorAll('[data-command]').forEach((el) => {
  el.addEventListener('click', (event) => {
    event.preventDefault();
    vscode.postMessage({
      type: 'command',
      command: el.dataset.command,
    });
  });
});

document.querySelectorAll('[data-url]').forEach((el) => {
  el.addEventListener('click', (event) => {
    event.preventDefault();
    vscode.postMessage({
      type: 'externalLink',
      url: el.dataset.url,
    });
  });
});
