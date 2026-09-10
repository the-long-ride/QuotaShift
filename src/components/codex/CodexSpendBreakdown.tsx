import React from "react";

interface CodexSpendBreakdownProps {
  snapshot: {
    models: any[];
  };
}

const compactFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

export const CodexSpendBreakdown: React.FC<CodexSpendBreakdownProps> = ({ snapshot }) => {
  const models = snapshot?.models || [];
  if (models.length === 0) {
    return <div style={{ fontSize: "8.5px", color: "var(--text-secondary)" }}>No usage recorded this period.</div>;
  }

  const totalSpend = models.reduce((sum: number, m: any) => sum + (m.costUsd || 0), 0);

  return (
    <div>
      {snapshot.models.map((m: any, idx: number) => {
        const pct = totalSpend > 0 ? Math.round((m.costUsd / totalSpend) * 100) : 0;
        return (
          <div key={idx} style={{ display: "flex", flexDirection: "column", gap: "3px", marginBottom: "6px" }}>
            <div className="quota-item-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="quota-model-name" style={{ fontSize: "9px", fontWeight: 600 }}>{m.model}</span>
              <span style={{ fontSize: "9px", color: "var(--text-secondary)" }}>{compactFormatter.format(m.costUsd)}</span>
            </div>
            <div className="quota-limit-bar-container">
              <div className="progress-container">
                <div className="progress-bar progress-bar--codex" style={{ width: `${pct}%` }} />
              </div>
              <span className="quota-value">{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
