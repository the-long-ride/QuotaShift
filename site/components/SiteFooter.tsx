import React from "react";

const RELEASES_URL = "https://github.com/the-long-ride/QuotaShift/releases/latest";

export const SiteFooter: React.FC = () => {
  return (
    <footer className="qs-footer">
      <div className="qs-footer-inner">
        <div className="qs-footer-meta">
          <strong className="qs-footer-brand">QuotaShift</strong>
          <span className="qs-footer-sep" aria-hidden="true">
            ·
          </span>
          <span>MIT License</span>
          <span className="qs-footer-sep" aria-hidden="true">
            ·
          </span>
          <span>Built with Tauri v2</span>
        </div>

        <nav className="qs-footer-links" aria-label="Project links">
          <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer">
            Latest Release
          </a>
        </nav>
      </div>
    </footer>
  );
};
