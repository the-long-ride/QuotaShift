/**
 * Sets `data-window-inactive="true"` on `:root` while the dashboard window is hidden or unfocused,
 * allowing infinite CSS animations to pause instead of waking Chromium's compositor while idle.
 */
export function installWindowActivityAttribute(): () => void {
  const syncActivity = () => {
    if (document.hidden || !document.hasFocus()) {
      document.documentElement.setAttribute("data-window-inactive", "true");
    } else {
      document.documentElement.removeAttribute("data-window-inactive");
    }
  };
  syncActivity();
  window.addEventListener("focus", syncActivity);
  window.addEventListener("blur", syncActivity);
  document.addEventListener("visibilitychange", syncActivity);
  return () => {
    window.removeEventListener("focus", syncActivity);
    window.removeEventListener("blur", syncActivity);
    document.removeEventListener("visibilitychange", syncActivity);
  };
}
