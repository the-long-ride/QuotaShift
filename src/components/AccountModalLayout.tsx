import React from "react";

interface AccountModalLayoutProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon: React.ReactNode;
  tabs?: React.ReactNode;
  footerButtons: React.ReactNode;
  children: React.ReactNode;
}

export const AccountModalLayout: React.FC<AccountModalLayoutProps> = ({
  isOpen,
  onClose,
  title,
  icon,
  tabs,
  footerButtons,
  children,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="dialog-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ display: "flex" }}
    >
      <div className="dialog-box dialog-box--account">
        <div className="dialog-header">
          {icon}
          <span>{title}</span>
        </div>

        {tabs}

        <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: "auto", paddingRight: "4px" }}>
            {children}
          </div>

          <div
            className="dialog-buttons"
            style={{
              marginTop: "14px",
              paddingTop: "14px",
              borderTop: "1px solid var(--border-color)",
              flexShrink: 0,
            }}
          >
            {footerButtons}
          </div>
        </div>
      </div>
    </div>
  );
};
