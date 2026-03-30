import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const CONFIG_NS = "moonchunk";
const LAST_VERSION_KEY = "moonchunk.lastSeenVersion";
const WALKTHROUGH_ID = "moonchunk.getting-started";
const HOME_PANEL_ID = "moonchunk.home";

const LINKS = {
  homepage: "https://github.com/dhunanyan/moonchunk-highlight-vscode-extension",
  marketplace:
    "https://marketplace.visualstudio.com/items?itemName=dhunanyan.moonchunk-highlight",
  issues:
    "https://github.com/dhunanyan/moonchunk-highlight-vscode-extension/issues",
  docs: "https://github.com/dhunanyan/moonchunk-highlight-vscode-extension/tree/main/docs",
};

let homePanel: vscode.WebviewPanel | undefined;

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(CONFIG_NS);
}

function loadUiFile(
  context: vscode.ExtensionContext,
  fileName: string,
): string {
  return fs.readFileSync(
    path.join(context.extensionUri.fsPath, "ui", fileName),
    "utf8",
  );
}

function getNonce(): string {
  return crypto.randomBytes(16).toString("hex");
}

async function openDashboard(context: vscode.ExtensionContext): Promise<void> {
  const walkthroughRef = `${context.extension.id}#${WALKTHROUGH_ID}`;
  await vscode.commands.executeCommand(
    "workbench.action.openWalkthrough",
    walkthroughRef,
    false,
  );
}

async function openDocsIndex(context: vscode.ExtensionContext): Promise<void> {
  const openInEditor = getConfig().get<boolean>("openDocsInEditor", true);
  if (!openInEditor) {
    await vscode.env.openExternal(vscode.Uri.parse(LINKS.docs));
    return;
  }

  const uri = vscode.Uri.joinPath(context.extensionUri, "docs", "INDEX.md");
  const doc = await vscode.workspace.openTextDocument(uri);
  await vscode.window.showTextDocument(doc, { preview: false });
}

function getHomeHtml(
  context: vscode.ExtensionContext,
  webview: vscode.Webview,
): string {
  const nonce = getNonce();
  const logoUri = webview.asWebviewUri(
    vscode.Uri.joinPath(context.extensionUri, "images", "logo.png"),
  );
  const importedStyles = loadUiFile(context, "style.css");
  const importedScript = loadUiFile(context, "script.js");
  const htmlTemplate = loadUiFile(context, "index.html");

  const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;

  const replacements: Record<string, string> = {
    "{{CSP}}": csp,
    "{{STYLE}}": `<style>${importedStyles}</style>`,
    "{{SCRIPT}}": `<script nonce="${nonce}">${importedScript}</script>`,
    "{{LOGO_URI}}": String(logoUri),
    "{{LINK_HOMEPAGE}}": LINKS.homepage,
    "{{LINK_MARKETPLACE}}": LINKS.marketplace,
    "{{LINK_ISSUES}}": LINKS.issues,
    "{{LINK_DOCS}}": LINKS.docs,
  };

  return Object.entries(replacements).reduce(
    (html, [token, value]) => html.split(token).join(value),
    htmlTemplate,
  );
}

function showHomePanel(context: vscode.ExtensionContext): void {
  if (homePanel) {
    homePanel.reveal(vscode.ViewColumn.One);
    return;
  }

  homePanel = vscode.window.createWebviewPanel(
    HOME_PANEL_ID,
    "MoonChunk Home",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.joinPath(context.extensionUri, "images"),
        vscode.Uri.joinPath(context.extensionUri, "docs"),
        vscode.Uri.joinPath(context.extensionUri, "ui"),
        context.extensionUri,
      ],
    },
  );

  homePanel.webview.html = getHomeHtml(context, homePanel.webview);

  homePanel.webview.onDidReceiveMessage(
    async (message: { type?: string; command?: string; url?: string }) => {
      if (!message) {
        return;
      }

      if (message.type === "externalLink" && message.url) {
        await vscode.env.openExternal(vscode.Uri.parse(message.url));
        return;
      }

      if (message.type !== "command" || !message.command) {
        return;
      }

      switch (message.command) {
        case "openDashboard":
          await vscode.commands.executeCommand("moonchunk.openDashboard");
          break;
        case "openDocsIndex":
          await vscode.commands.executeCommand("moonchunk.openDocsIndex");
          break;
        case "openMarketplacePage":
          await vscode.commands.executeCommand("moonchunk.openMarketplacePage");
          break;
        case "openSettings":
          await vscode.commands.executeCommand("moonchunk.openSettings");
          break;
        case "showSnippets":
          await vscode.commands.executeCommand("editor.action.insertSnippet");
          break;
        default:
          break;
      }
    },
  );

  homePanel.onDidDispose(() => {
    homePanel = undefined;
  });
}

async function maybeShowPostInstallExperience(
  context: vscode.ExtensionContext,
): Promise<void> {
  const config = getConfig();
  const showWalkthrough = config.get<boolean>(
    "showWalkthroughOnInstallOrUpdate",
    true,
  );
  const postInstallExperience = config.get<string>(
    "postInstallExperience",
    "home",
  );
  const currentVersion = context.extension.packageJSON.version as string;
  const previousVersion = context.globalState.get<string>(LAST_VERSION_KEY);

  if (previousVersion === currentVersion) {
    return;
  }

  await context.globalState.update(LAST_VERSION_KEY, currentVersion);

  if (postInstallExperience === "home") {
    showHomePanel(context);
    return;
  }

  if (showWalkthrough || postInstallExperience === "walkthrough") {
    await openDashboard(context);
  }
}

function registerCommands(context: vscode.ExtensionContext): void {
  const subscriptions: vscode.Disposable[] = [
    vscode.commands.registerCommand("moonchunk.openHome", async () => {
      showHomePanel(context);
    }),

    vscode.commands.registerCommand("moonchunk.openDashboard", async () => {
      await openDashboard(context);
    }),

    vscode.commands.registerCommand("moonchunk.openDocsIndex", async () => {
      await openDocsIndex(context);
    }),

    vscode.commands.registerCommand(
      "moonchunk.openMarketplacePage",
      async () => {
        await vscode.env.openExternal(vscode.Uri.parse(LINKS.marketplace));
      },
    ),

    vscode.commands.registerCommand("moonchunk.openSettings", async () => {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:dhunanyan.moonchunk-highlight moonchunk",
      );
    }),
  ];

  context.subscriptions.push(...subscriptions);
}

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  registerCommands(context);
  await maybeShowPostInstallExperience(context);
}

export function deactivate(): void {
  // No-op.
}
