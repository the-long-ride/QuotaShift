import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

export function useCodexBrowserOAuth(showAlert: (msg: string) => Promise<void>) {
  const [oauthStep, setOauthStep] = useState<1 | 2 | 3>(1);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthStatusText, setOauthStatusText] = useState("");
  const [oauthStatusType, setOauthStatusType] = useState<"normal" | "error" | "success">("normal");

  const resetOAuth = () => {
    setOauthStep(1);
    setOauthLoading(false);
    setOauthStatusText("");
    setOauthStatusType("normal");
  };

  const handleStartBrowserLogin = async () => {
    setOauthStatusType("normal");
    setOauthStatusText("");
    try {
      setOauthLoading(true);
      const authUrl = await invoke<string>("start_oauth_flow");
      openUrl(authUrl);
      setOauthStep(2);
      setOauthStatusText("Awaiting callback from browser...");
    } catch (err: any) {
      setOauthLoading(false);
      setOauthStatusType("error");
      setOauthStatusText(err?.message ?? String(err));
    }
  };

  const handleCopyLoginLink = async () => {
    setOauthStatusType("normal");
    setOauthStatusText("");
    try {
      setOauthLoading(true);
      const authUrl = await invoke<string>("start_oauth_flow");
      await navigator.clipboard.writeText(authUrl);
      setOauthStep(2);
      setOauthStatusType("success");
      setOauthStatusText(
        "✓ Link copied! Paste and authenticate in your browser, then we'll automatically redirect back.",
      );
    } catch (err: any) {
      setOauthLoading(false);
      setOauthStatusType("error");
      setOauthStatusText(err?.message ?? String(err));
    }
  };

  const handleResetSession = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      await invoke("reset_oauth_session");
      resetOAuth();
    } catch (err: any) {
      await showAlert("Failed to reset session: " + err);
    }
  };

  return {
    oauthStep,
    setOauthStep,
    oauthLoading,
    setOauthLoading,
    oauthStatusText,
    setOauthStatusText,
    oauthStatusType,
    setOauthStatusType,
    resetOAuth,
    handleStartBrowserLogin,
    handleCopyLoginLink,
    handleResetSession,
  };
}
