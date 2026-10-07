import { useRef } from "react";
import type { UseAppEventListenersParams } from "./useAppEventListeners.types";

export function useAppEventListenersRefs(params: UseAppEventListenersParams) {
  const onClearSearchRef = useRef(params.onClearSearch);
  onClearSearchRef.current = params.onClearSearch;
  const refreshTrackedAccountOnlyRef = useRef(params.refreshTrackedAccountOnly);
  refreshTrackedAccountOnlyRef.current = params.refreshTrackedAccountOnly;
  const platformVisibilityRef = useRef(params.platformVisibility);
  platformVisibilityRef.current = params.platformVisibility;
  const fetchAccountUsageRef = useRef(params.fetchAccountUsage);
  fetchAccountUsageRef.current = params.fetchAccountUsage;
  const refreshAntigravityAccountsCloudFirstRef = useRef(
    params.refreshAntigravityAccountsCloudFirst,
  );
  refreshAntigravityAccountsCloudFirstRef.current = params.refreshAntigravityAccountsCloudFirst;
  const setActiveTabRef = useRef(params.setActiveTab);
  setActiveTabRef.current = params.setActiveTab;
  const setAntigravityUsageCacheRef = useRef(params.setAntigravityUsageCache);
  setAntigravityUsageCacheRef.current = params.setAntigravityUsageCache;
  const setLastFullStatusRef = useRef(params.setLastFullStatus);
  setLastFullStatusRef.current = params.setLastFullStatus;
  const updateLocalSessionFromStatusRef = useRef(params.updateLocalSessionFromStatus);
  updateLocalSessionFromStatusRef.current = params.updateLocalSessionFromStatus;
  const setAntigravityAccountsRef = useRef(params.setAntigravityAccounts);
  setAntigravityAccountsRef.current = params.setAntigravityAccounts;
  const setCodexAccountsRef = useRef(params.setCodexAccounts);
  setCodexAccountsRef.current = params.setCodexAccounts;

  return {
    onClearSearchRef,
    refreshTrackedAccountOnlyRef,
    platformVisibilityRef,
    fetchAccountUsageRef,
    refreshAntigravityAccountsCloudFirstRef,
    setActiveTabRef,
    setAntigravityUsageCacheRef,
    setLastFullStatusRef,
    updateLocalSessionFromStatusRef,
    setAntigravityAccountsRef,
    setCodexAccountsRef,
  };
}
