export function formatHtmlDocument(
  html: string,
  enabled: boolean,
  filePath?: string,
): string {
  if (!enabled) return html;

  try {
    const prettier = require("prettier");
    const resolved =
      typeof prettier.resolveConfig?.sync === "function" && filePath
        ? prettier.resolveConfig.sync(filePath)
        : null;

    const formatted = prettier.format(html, {
      ...(resolved || {}),
      parser: "html",
    });

    if (typeof formatted === "string") {
      return formatted;
    }
  } catch {
    // Fallback: keep original HTML if formatter is unavailable.
  }

  return html;
}
