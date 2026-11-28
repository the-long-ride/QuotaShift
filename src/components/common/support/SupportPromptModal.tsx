import React, { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { useGithubStarCount } from "../../../hooks/desktop/useGithubStarCount";
import {
  GITHUB_DONATE_URL,
  createSupportPromptActivationGate,
  GITHUB_REPO_URL,
  formatStarCount,
  loadSupportPromptState,
  markSupportPromptShown,
  msUntilNextSupportPrompt,
  setSupportPromptDontShowAgain,
  shouldShowSupportPrompt,
} from "../../../utils/common/support-prompt";
import { useCloseOnEscape } from "../dialogs/useCloseOnEscape";
import { SettingsCloseIcon } from "../settings-controls/SettingsIcons";
import { SupportHeartIcon, SupportStarIcon } from "./SupportIcons";

const MAX_TIMER_SLICE_MS = 60 * 60 * 1000;

export const SupportPromptModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(() => loadSupportPromptState().dontShowAgain);
  const starCount = useGithubStarCount(isOpen);
  const starLabel = formatStarCount(starCount);

  useEffect(() => {
    let active = true;
    let timeout: number | null = null;
    let unlistenFocus: (() => void) | undefined;
    let unlistenShown: (() => void) | undefined;
    const mainWindow = getCurrentWindow();
    const activation = createSupportPromptActivationGate();
    // Record the native startup focus state before permitting modal activation.
    void Promise.all([mainWindow.isVisible(), mainWindow.isFocused()])
      .then(([visible, focused]) => {
        if (active) activation.initialize(visible, focused);
      })
      .catch(() => {
        if (active) activation.initialize(true, true);
      });

    // Eligibility may mature while QuotaShift is hidden. Never mount a modal from
    // the startup or background timer; only a later main-window focus/show can show it.
    const scheduleEligibility = () => {
      if (timeout !== null) window.clearTimeout(timeout);
      timeout = null;
      const state = loadSupportPromptState();
      setDontShowAgain(state.dontShowAgain);
      const wait = msUntilNextSupportPrompt(state);
      if (wait !== null && wait > 0) {
        timeout = window.setTimeout(scheduleEligibility, Math.min(wait, MAX_TIMER_SLICE_MS));
      }
    };
    const onMainWindowActivation = async () => {
      if (!active || document.hidden) return;
      const state = loadSupportPromptState();
      if (!shouldShowSupportPrompt(state)) {
        scheduleEligibility();
        return;
      }
      try {
        if (!(await mainWindow.isVisible()) || !(await mainWindow.isFocused())) return;
        if (active) {
          setDontShowAgain(state.dontShowAgain);
          setIsOpen(true);
        }
      } catch {
        // A failed visibility check must not obstruct the main window.
      }
    };
    const focus = () => {
      if (activation.canOpenOnFocus()) void onMainWindowActivation();
    };
    const blurred = () => activation.markInactive();
    const shown = () => {
      if (activation.canOpenOnShow()) void onMainWindowActivation();
    };
    const visibilityChanged = () => {
      if (document.hidden) blurred();
      else focus();
    };
    scheduleEligibility();
    window.addEventListener("focus", focus);
    window.addEventListener("blur", blurred);
    document.addEventListener("visibilitychange", visibilityChanged);
    void mainWindow
      .onFocusChanged(({ payload }) => {
        if (payload) focus();
        else blurred();
      })
      .then((dispose) => {
        if (active) unlistenFocus = dispose;
        else dispose();
      })
      .catch(() => {});
    void listen("window-shown", shown)
      .then((dispose) => {
        if (active) unlistenShown = dispose;
        else dispose();
      })
      .catch(() => {});
    return () => {
      active = false;
      if (timeout !== null) window.clearTimeout(timeout);
      window.removeEventListener("focus", focus);
      window.removeEventListener("blur", blurred);
      document.removeEventListener("visibilitychange", visibilityChanged);
      unlistenFocus?.();
      unlistenShown?.();
    };
  }, []);

  const dismissModal = useCallback(() => {
    markSupportPromptShown(Date.now(), dontShowAgain);
    setIsOpen(false);
  }, [dontShowAgain]);

  useCloseOnEscape(isOpen, dismissModal);

  const handleToggleDontShow = (checked: boolean) => {
    setDontShowAgain(checked);
    setSupportPromptDontShowAgain(checked);
  };

  const handleStarClick = () => {
    void openUrl(GITHUB_REPO_URL);
    dismissModal();
  };

  const handleDonateClick = () => {
    void openUrl(GITHUB_DONATE_URL);
    dismissModal();
  };

  if (!isOpen) return null;

  return (
    <div
      className="dialog-overlay support-prompt-overlay"
      data-no-window-drag
      onClick={(e) => {
        if (e.target === e.currentTarget) dismissModal();
      }}
    >
      <div
        className="dialog-box support-prompt-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-prompt-title"
      >
        <button
          type="button"
          className="support-modal-close"
          onClick={dismissModal}
          data-tooltip="Close"
          aria-label="Close"
        >
          <SettingsCloseIcon />
        </button>

        <div className="support-prompt-hero">
          <div className="support-hero-medallion">
            <SupportHeartIcon size={20} filled />
          </div>
          <h2 id="support-prompt-title" className="support-prompt-title">
            Enjoying QuotaShift?
          </h2>
          <p className="support-prompt-subtitle">
            Thanks for spending time with QuotaShift! It&apos;s free, open source, and built with
            care in spare hours. If it makes your day a little easier, here are two ways to cheer it
            on:
          </p>
        </div>

        <div className="support-cards-grid">
          <div className="support-card support-card--star">
            <div className="support-card-badge support-card-badge--star">
              <SupportStarIcon size={15} filled />
            </div>
            <h3 className="support-card-title">Leave a star</h3>
            <p className="support-card-desc">
              Free and takes a few seconds. It helps others discover the project.
            </p>
            <button
              type="button"
              className="support-cta-btn support-cta-btn--star"
              onClick={handleStarClick}
              data-tooltip="Open QuotaShift repository on GitHub"
            >
              <SupportStarIcon size={13} filled />
              <span>Star on GitHub</span>
              {starLabel !== null && <span className="support-star-count-badge">{starLabel}</span>}
            </button>
          </div>

          <div className="support-card support-card--donate">
            <div className="support-card-badge support-card-badge--donate">
              <SupportHeartIcon size={15} filled />
            </div>
            <h3 className="support-card-title">Make a donation</h3>
            <p className="support-card-desc">
              Any amount helps keep new features and fixes coming.
            </p>
            <button
              type="button"
              className="support-cta-btn support-cta-btn--donate"
              onClick={handleDonateClick}
              data-tooltip="Open developer donation section on GitHub"
            >
              <SupportHeartIcon size={13} filled />
              <span>Donate</span>
            </button>
          </div>
        </div>

        <p className="support-prompt-note">Either way, thank you for being here!</p>

        <div className="support-prompt-footer">
          <label className="support-dont-show-label">
            <input
              type="checkbox"
              className="support-dont-show-checkbox"
              checked={dontShowAgain}
              onChange={(e) => handleToggleDontShow(e.target.checked)}
            />
            <span>Don&apos;t show this again</span>
          </label>
          <button
            type="button"
            className="support-maybe-later-btn"
            onClick={dismissModal}
            data-tooltip="Remind again later"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};
