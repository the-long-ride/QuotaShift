import React from "react";
import logoDarkTheme from "../../assets/icons/quota-shift-logo-512.png";
import logoLightTheme from "../../assets/icons/quota-shift-logo-dark-512.png";
import { useGithubRepoStars } from "../hooks/useGithubRepoStars";

const REPO_URL = "https://github.com/the-long-ride/QuotaShift";
const AUTHOR_URL = "https://github.com/the-long-ride";

export interface SiteNavbarProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

export const SiteNavbar: React.FC<SiteNavbarProps> = ({ isDarkMode, onToggleTheme }) => {
  const { formattedCount, loading } = useGithubRepoStars();

  return (
    <header className="qs-navbar">
      <div className="qs-navbar-inner">
        <a href="#top" className="qs-brand" aria-label="QuotaShift home">
          <img
            src={isDarkMode ? logoDarkTheme : logoLightTheme}
            alt="QuotaShift logo"
            className="qs-brand-logo"
            width={24}
            height={24}
          />
          <span className="qs-brand-name">QuotaShift</span>
        </a>

        <nav className="qs-nav-links" aria-label="Primary navigation">
          <a href="#demo" className="qs-nav-link">
            Live Demo
          </a>
          <a href="#about" className="qs-nav-link">
            Highlights
          </a>
        </nav>

        <div className="qs-nav-actions">
          <a href={AUTHOR_URL} target="_blank" rel="noopener noreferrer" className="qs-nav-author">
            @the-long-ride
          </a>

          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="qs-btn qs-btn-secondary qs-btn-sm qs-nav-github-btn"
            title={
              formattedCount !== null
                ? `QuotaShift on GitHub (${formattedCount} stars)`
                : "QuotaShift on GitHub"
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 .5a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.04c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.08 1.84 1.24 1.84 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.82.58A12 12 0 0 0 12 .5Z" />
            </svg>
            <span>GitHub</span>
            {(formattedCount !== null || loading) && (
              <>
                <span className="qs-nav-gh-divider" aria-hidden="true" />
                <span className="qs-nav-gh-stars" data-testid="github-star-count">
                  <svg
                    className="qs-nav-gh-star-icon"
                    width="12"
                    height="12"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M8 1.75l1.93 3.91 4.32.63-3.12 3.04.74 4.3L8 11.6l-3.87 2.03.74-4.3L1.75 6.29l4.32-.63L8 1.75z" />
                  </svg>
                  <span className="qs-nav-gh-star-value">{formattedCount ?? "…"}</span>
                </span>
              </>
            )}
          </a>

          <button
            type="button"
            className="qs-icon-btn"
            onClick={onToggleTheme}
            aria-label={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
            title={isDarkMode ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDarkMode ? (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
