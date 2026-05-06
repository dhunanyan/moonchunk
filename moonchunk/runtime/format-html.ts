import prettier from "prettier";

function stripEmptyOptionalHeadTags(html: string): string {
  let out = html;

  // Remove empty title.
  out = out.replace(/<title>\s*<\/title>\s*/gi, "");

  // Remove metadata tags where content is empty.
  out = out.replace(/<meta\b([^>]*?)\scontent="\s*"\s*\/?>\s*/gi, "");

  // Remove link tags where href is empty.
  out = out.replace(/<link\b([^>]*?)\shref="\s*"\s*\/?>\s*/gi, "");

  // Remove script tags where src is empty.
  out = out.replace(/<script\b([^>]*?)\ssrc="\s*"\s*>\s*<\/script>\s*/gi, "");

  return out;
}

export function formatHtmlDocument(
  html: string,
  enabled: boolean,
  filePath?: string,
): string {
  const sanitized = stripEmptyOptionalHeadTags(html);
  if (!enabled) return sanitized;

  try {
    const resolved =
      typeof prettier.resolveConfig?.sync === "function" && filePath
        ? prettier.resolveConfig.sync(filePath)
        : null;

    const formatted = prettier.format(sanitized, {
      ...(resolved || {}),
      parser: "html",
    });

    if (typeof formatted === "string") {
      return formatted;
    }
  } catch {
    // Fallback: keep original HTML if formatter is unavailable.
  }

  return sanitized;
}
