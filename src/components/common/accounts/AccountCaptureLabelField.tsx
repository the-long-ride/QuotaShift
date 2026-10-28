import React from "react";

interface AccountCaptureLabelFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}

/** Standard optional fallback label field for local account capture tabs. */
export const AccountCaptureLabelField: React.FC<AccountCaptureLabelFieldProps> = ({
  id,
  value,
  onChange,
  onSubmit,
  inputRef,
}) => (
  <div className="form-field" style={{ marginBottom: "12px" }}>
    <label className="form-label" htmlFor={id}>
      Fallback Account Name (optional; one account only)
    </label>
    <input
      ref={inputRef}
      type="text"
      id={id}
      className="form-input"
      placeholder="e.g. Work Profile"
      maxLength={32}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSubmit();
        }
      }}
    />
    <p className="oauth-step-desc" style={{ marginTop: "6px" }}>
      Only used when QuotaShift cannot get the name and one unique account is found. Leave blank to
      use the part before @ in the email address.
    </p>
  </div>
);
