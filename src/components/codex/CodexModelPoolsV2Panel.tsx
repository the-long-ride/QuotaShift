import React, { useCallback, useState } from "react";
import type { SiwcAccountView } from "../../utils/codex/siwc-types";
import type {
  CodexAccount,
  CodexModelCatalogCacheEntry,
  CodexRouterStatus,
} from "../../utils/common/types";
import type { ToastKind } from "../common/Toast";
import type { CodexModelPoolV2 } from "../../utils/codex/codex-pools-v2-types";
import { validateEnabledPoolNames } from "../../utils/codex/codex-pools-v2";
import { useAccountCardGridColumns } from "../../hooks/accounts/useAccountCardGridColumns";
import { CodexAddIcon } from "./CodexIcons";
import { CodexModelPoolV2Card } from "./CodexModelPoolV2Card";
import { CodexModelPoolV2Editor } from "./CodexModelPoolV2Editor";
import { SiwcAccountPanel } from "./SiwcAccountPanel";
import { CodexRouterServerPanel } from "./CodexRouterServerPanel";

export interface CodexModelPoolsV2PanelProps {
  pools: CodexModelPoolV2[];
  accounts: CodexAccount[];
  usageCache?: Record<string, any>;
  modelCache?: Record<string, CodexModelCatalogCacheEntry>;
  onRequestModelScan?: (account: CodexAccount) => void | Promise<void>;
  routerStatus?: CodexRouterStatus | null;
  poolRoutingEnabled?: boolean;
  poolRoutingBusy?: boolean;
  onToggleRouting?: () => void;
  onChangePools: (next: CodexModelPoolV2[]) => boolean;
  showToast?: (message: string, kind?: ToastKind) => void;
}

export const CodexModelPoolsV2Panel: React.FC<CodexModelPoolsV2PanelProps> = ({
  pools,
  accounts,
  usageCache = {},
  modelCache = {},
  onRequestModelScan,
  routerStatus,
  poolRoutingEnabled = false,
  poolRoutingBusy = false,
  onToggleRouting,
  onChangePools,
  showToast,
}) => {
  const gridStyle = useAccountCardGridColumns();
  const [editingPool, setEditingPool] = useState<CodexModelPoolV2 | null>(null);
  const [nativeSiwcAccounts, setNativeSiwcAccounts] = useState<SiwcAccountView[]>([]);
  const updateNativeAccounts = useCallback((accounts: SiwcAccountView[]) => {
    setNativeSiwcAccounts(accounts);
  }, []);
  const [editorOpen, setEditorOpen] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const enabledCount = pools.filter((pool) => pool.enabled).length;

  const update = (next: CodexModelPoolV2[]): boolean => {
    const result = validateEnabledPoolNames(next, accounts);
    if (!result.valid) {
      setInlineError(result.error || "Invalid model pool configuration");
      return false;
    }
    if (!onChangePools(next)) {
      setInlineError("Unable to save model pool configuration.");
      return false;
    }
    setInlineError("");
    return true;
  };

  const onToggleEnabled = (pool: CodexModelPoolV2) => {
    if (
      !pool.enabled &&
      pool.authMode === "siwc" &&
      !pool.memberAccountIds.every((id) =>
        nativeSiwcAccounts.some((a) => a.id === id && a.isRoutable),
      )
    ) {
      setInlineError(
        "This SIWC pool needs separately authorized native SIWC sign-in. Existing Codex OAuth sessions cannot authorize Model Pool Routing.",
      );
      return;
    }
    update(pools.map((item) => (item.id === pool.id ? { ...item, enabled: !item.enabled } : item)));
  };

  return (
    <div className="app-content qs-model-pools">
      <SiwcAccountPanel
        poolCount={pools.length}
        enabledPoolCount={enabledCount}
        onNewPool={() => {
          setEditingPool(null);
          setEditorOpen(true);
        }}
        onAccountsChanged={updateNativeAccounts}
        onRegistrationDisconnected={(id) => {
          update(
            pools.map((pool) =>
              pool.authMode === "siwc" && pool.memberAccountIds.includes(id)
                ? {
                    ...pool,
                    enabled: false,
                    memberAccountIds: pool.memberAccountIds.filter((member) => member !== id),
                  }
                : pool,
            ),
          );
        }}
      >
        {inlineError && (
          <div className="codex-model-validation codex-model-validation--error" role="alert">
            {inlineError}
          </div>
        )}

        {pools.length === 0 ? (
          <div className="qs-model-pools-empty">
            No Model Pools yet. Create one to expose a routing model.
          </div>
        ) : (
          <div className="codex-accounts-container qs-model-pools-grid" style={gridStyle}>
            {pools.map((pool) => (
              <CodexModelPoolV2Card
                key={pool.id}
                pool={pool}
                accounts={accounts}
                siwcAccounts={nativeSiwcAccounts}
                usageCache={usageCache}
                onToggleEnabled={onToggleEnabled}
                onEdit={(target) => {
                  setEditingPool(target);
                  setEditorOpen(true);
                }}
                onDelete={(target) => update(pools.filter((item) => item.id !== target.id))}
              />
            ))}
          </div>
        )}
      </SiwcAccountPanel>

      <CodexRouterServerPanel
        status={routerStatus ?? null}
        accounts={accounts}
        siwcAccounts={nativeSiwcAccounts}
        showToast={showToast}
        poolRoutingEnabled={poolRoutingEnabled}
        poolRoutingBusy={poolRoutingBusy}
        enabledPoolCount={enabledCount}
        onToggleRouting={onToggleRouting}
      />

      {editorOpen && (
        <CodexModelPoolV2Editor
          pool={editingPool}
          accounts={accounts}
          siwcAccounts={nativeSiwcAccounts}
          modelCache={modelCache}
          onRequestModelScan={onRequestModelScan}
          onClose={() => setEditorOpen(false)}
          onSave={(pool) => update([...pools.filter((item) => item.id !== pool.id), pool])}
        />
      )}
    </div>
  );
};
