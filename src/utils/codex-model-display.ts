export interface ClipboardWriter {
  writeText(text: string): Promise<void>;
}

export function humanizeCodexModelName(displayName: string | null | undefined, modelId: string): string {
  const source = (displayName || modelId || "").trim();
  return source.replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

export function formatCodexModelLine(displayName: string | null | undefined, modelId: string): string {
  return `${humanizeCodexModelName(displayName, modelId)} - ${modelId}`;
}

export async function copyCodexModelId(
  modelId: string,
  clipboard?: ClipboardWriter | null,
): Promise<boolean> {
  const target = clipboard ?? (typeof navigator !== "undefined" ? navigator.clipboard : null);
  if (target?.writeText) {
    try {
      await target.writeText(modelId);
      return true;
    } catch {
      // Fall back to a temporary textarea for webviews without Clipboard API permission.
    }
  }

  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = modelId;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}
