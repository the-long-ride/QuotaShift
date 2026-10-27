import React from "react";

export const CodexCardError: React.FC<{ error?: string | null }> = ({ error }) => {
  if (!error) return null;
  return (
    <div className="codex-card-status codex-card-status--error">
      <span>Failed to load: {error}</span>
    </div>
  );
};
