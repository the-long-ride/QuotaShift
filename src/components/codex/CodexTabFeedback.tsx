import React from "react";

export interface CodexTabFeedbackProps {
  feedback: string | null;
  error: string | null;
}

export const CodexTabFeedback: React.FC<CodexTabFeedbackProps> = ({ feedback, error }) => {
  return (
    <>
      {feedback && (
        <div className="codex-hint-text" role="status">
          {feedback}
        </div>
      )}
      {error && (
        <div className="codex-model-validation codex-model-validation--error" role="alert">
          {error}
        </div>
      )}
    </>
  );
};
