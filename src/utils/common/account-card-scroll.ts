/**
 * Utilities for focusing and smoothly scrolling to account cards in the main dashboard.
 */

export const FOCUS_ACCOUNT_CARD_EVENT = "focus-account-card";

export interface FocusAccountCardPayload {
  provider: string;
  accountId?: string | null;
}

const PROVIDER_PREFIX_MAP: Record<string, string> = {
  antigravity: "ag-account-",
  codex: "codex-account-",
  claude: "claude-account-",
};

/** Locates the DOM element representing the given account in any provider tab. */
export function findAccountCardElement(
  provider: string,
  accountId?: string | null,
): HTMLElement | null {
  if (typeof document === "undefined") return null;

  // 1. Direct search by prefix map and attribute matchers when specific ID is provided
  if (accountId && accountId !== "local" && accountId !== "codex" && accountId !== "claude-local") {
    const prefix = PROVIDER_PREFIX_MAP[provider];
    if (prefix) {
      const el = document.getElementById(`${prefix}${accountId}`);
      if (el) return el;
    }
    const direct =
      document.getElementById(`${provider}-account-${accountId}`) ||
      document.querySelector<HTMLElement>(`[data-sortable-account-id="${accountId}"]`) ||
      document.querySelector<HTMLElement>(`[id$="-${accountId}"]`);
    if (direct) return direct;
  }

  // 2. Fallback for generic account IDs ("local", "codex", "claude-local") or unmapped cards:
  // locate the monitored card, active card, or first card within the active tab container.
  const tabSelector =
    provider === "claude"
      ? ".claude-accounts-flow, .claude-monitor"
      : provider === "antigravity"
        ? ".monitored-account-list, .codex-accounts-container"
        : ".codex-accounts-container";

  const tabContainer = document.querySelector<HTMLElement>(tabSelector);
  if (tabContainer) {
    const monitored = tabContainer.querySelector<HTMLElement>(".account-card.monitored");
    if (monitored) return monitored;
    const active = tabContainer.querySelector<HTMLElement>(".account-card.account-card--active");
    if (active) return active;
    const first = tabContainer.querySelector<HTMLElement>(".account-card");
    if (first) return first;
  }

  return null;
}

/** Finds the scrollable ancestor element hosting the account card list. */
export function findScrollContainer(element: HTMLElement): HTMLElement | null {
  let parent = element.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    if (
      (style.overflowY === "auto" || style.overflowY === "scroll") &&
      parent.scrollHeight >= parent.clientHeight
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return (
    document.querySelector<HTMLElement>(".codex-accounts-container") ||
    document.querySelector<HTMLElement>(".claude-monitor") ||
    null
  );
}

/**
 * Calculates exact offset to center the element within its container and scrolls it.
 */
export function centerElementInContainer(
  container: HTMLElement,
  element: HTMLElement,
  smooth = true,
): void {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  if (containerRect.height === 0 || elementRect.height === 0) return;

  const currentRelativeTop = elementRect.top - containerRect.top;
  const targetRelativeTop = (container.clientHeight - elementRect.height) / 2;
  const scrollDelta = currentRelativeTop - targetRelativeTop;
  const maxScroll = Math.max(0, container.scrollHeight - container.clientHeight);
  const targetScrollTop = Math.max(0, Math.min(maxScroll, container.scrollTop + scrollDelta));

  container.scrollTo({
    top: targetScrollTop,
    behavior: smooth ? "smooth" : "auto",
  });
}

/**
 * Smoothly centers the target account card in its scrollable view and adds a focus pulse.
 * Retries across animation frames and intervals while React mounts and the window becomes active.
 * Performs post-scroll verification to guarantee the card remains centered.
 */
export function scrollToAccountCard(provider: string, accountId?: string | null): void {
  if (typeof document === "undefined") return;
  let attempts = 0;
  const maxAttempts = 24;

  const applyFocusAndCenter = (el: HTMLElement) => {
    const container = findScrollContainer(el);
    if (container && container.clientHeight > 0) {
      centerElementInContainer(container, el, true);
    }
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    el.classList.add("account-card--focused");
    window.setTimeout(() => {
      el.classList.remove("account-card--focused");
    }, 1600);

    const verifyCentering = () => {
      const scrollParent = findScrollContainer(el);
      if (!scrollParent || scrollParent.clientHeight === 0) return;
      const cRect = scrollParent.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const currentRelTop = eRect.top - cRect.top;
      const targetRelTop = (scrollParent.clientHeight - eRect.height) / 2;
      if (Math.abs(currentRelTop - targetRelTop) > 16) {
        centerElementInContainer(scrollParent, el, false);
      }
    };
    window.setTimeout(verifyCentering, 150);
    window.setTimeout(verifyCentering, 350);
  };

  const tryScroll = () => {
    const el = findAccountCardElement(provider, accountId);
    const container = el ? findScrollContainer(el) : null;
    const hasRealLayout =
      typeof window !== "undefined" &&
      Boolean(window.innerHeight > 0 || (document.body && document.body.clientHeight > 0));
    const isVisible =
      !hasRealLayout || (el && (el.offsetHeight > 0 || el.getBoundingClientRect().height > 0));
    const isContainerReady = !hasRealLayout || !container || container.clientHeight > 0;

    if (el && isVisible && isContainerReady) {
      applyFocusAndCenter(el);
      return;
    }
    if (++attempts <= maxAttempts) {
      window.setTimeout(tryScroll, 50);
    }
  };

  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(tryScroll);
  } else {
    tryScroll();
  }
}
