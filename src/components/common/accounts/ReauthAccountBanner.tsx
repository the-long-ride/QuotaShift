import React, { useState, useEffect } from "react";

export interface ReauthAccountBannerProps {
  email?: string | null;
  avatarUrl?: string | null;
  fallbackText?: string | null;
}

export const ReauthAccountBanner: React.FC<ReauthAccountBannerProps> = ({
  email,
  avatarUrl,
  fallbackText,
}) => {
  const [hasAvatarError, setHasAvatarError] = useState(false);

  useEffect(() => {
    setHasAvatarError(false);
  }, [avatarUrl]);

  const displayEmail = email || fallbackText || "Account";
  const initial = (fallbackText || displayEmail || "A").trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="reauth-account-row">
      <span className="reauth-account-label">Re-auth account:</span>
      <div className="reauth-account-target">
        {avatarUrl && !hasAvatarError ? (
          <img
            className="reauth-account-avatar"
            src={avatarUrl}
            alt="Avatar"
            referrerPolicy="no-referrer"
            onError={() => setHasAvatarError(true)}
          />
        ) : (
          <div className="reauth-account-avatar reauth-account-avatar--fallback">{initial}</div>
        )}
        <span className="reauth-account-email" data-tooltip={displayEmail}>
          {displayEmail}
        </span>
      </div>
    </div>
  );
};
