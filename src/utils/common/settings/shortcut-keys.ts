/** `platform` overrides the host platform, so the same shortcut can be labelled for any OS. */
export function formatShortcutDisplay(shortcut: string, platform?: string): string {
  if (!shortcut) return "";
  const hostPlatform = typeof navigator !== "undefined" ? navigator.platform || "" : "";
  const isMac = /(Mac|iPhone|iPod|iPad)/i.test(platform ?? hostPlatform);
  return shortcut
    .split("+")
    .map((part) => {
      const p = part.trim();
      if (p === "CommandOrControl" || p === "CmdOrCtrl") return isMac ? "Cmd" : "Ctrl";
      if (p === "Command") return "Cmd";
      if (p === "Control") return "Ctrl";
      return p;
    })
    .join(" + ");
}

export function shortcutKeycaps(shortcut: string): string[] {
  const display = formatShortcutDisplay(shortcut);
  return display ? display.split(" + ") : [];
}

function keyNameFromEvent(e: { key: string; code?: string }): string | null {
  if (e.code?.startsWith("Key")) return e.code.slice(3).toUpperCase();
  if (e.code?.startsWith("Digit")) return e.code.slice(5);
  if (/^F\d{1,2}$/i.test(e.key)) return e.key.toUpperCase();
  if (e.key.length === 1 && /[a-zA-Z0-9]/.test(e.key)) return e.key.toUpperCase();

  const punctuation: Record<string, string> = {
    Comma: ",",
    Period: ".",
    Slash: "/",
    Semicolon: ";",
    Quote: "'",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Minus: "-",
    Equal: "=",
    NumpadAdd: "=",
    NumpadSubtract: "-",
    Numpad0: "0",
    Space: "Space",
  };
  if (e.code && punctuation[e.code]) return punctuation[e.code];
  if (e.key === "=" || e.key === "-") return e.key;
  return null;
}

export function buildShortcutFromKeyEvent(e: {
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  key: string;
  code?: string;
}): string | null {
  if (["Control", "Alt", "Shift", "Meta"].includes(e.key)) return null;
  if (!(e.ctrlKey || e.altKey || e.shiftKey || e.metaKey)) return null;

  const keyName = keyNameFromEvent(e);
  if (!keyName) return null;

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  parts.push(keyName);
  return parts.join("+");
}

export function matchesShortcutEvent(
  e: {
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    metaKey: boolean;
    key: string;
    code?: string;
  },
  shortcut: string,
): boolean {
  if (!shortcut) return false;
  const parts = shortcut.split("+").map((part) => part.trim());
  const expectsPrimary = parts.includes("CommandOrControl") || parts.includes("CmdOrCtrl");
  const expectsControl = parts.includes("Control");
  const expectsCommand = parts.includes("Command");
  const expectsAlt = parts.includes("Alt") || parts.includes("Option");
  const expectsShift = parts.includes("Shift");

  if (expectsPrimary ? !(e.ctrlKey || e.metaKey) : expectsControl ? !e.ctrlKey : e.ctrlKey)
    return false;
  if (expectsCommand ? !e.metaKey : !expectsPrimary && e.metaKey) return false;
  if (e.altKey !== expectsAlt || e.shiftKey !== expectsShift) return false;

  const modifierNames = new Set([
    "CommandOrControl",
    "CmdOrCtrl",
    "Control",
    "Command",
    "Alt",
    "Option",
    "Shift",
  ]);
  const expectedKey = parts.find((part) => !modifierNames.has(part));
  const eventKey = keyNameFromEvent(e);
  if (!expectedKey || !eventKey) return false;
  return expectedKey.toUpperCase() === eventKey.toUpperCase();
}
