import React, { useEffect, useState } from "react";
import type {
  CliProvider,
  CliRotationBindingsV1,
  CliRotationPoolV1,
} from "../../utils/cli-pools/types";
import {
  loadCliRotationBindings,
  loadCliRotationPools,
  saveCliRotationBindings,
  saveCliRotationPools,
} from "../../utils/common/app-storage";
import { AccountModalLayout } from "./AccountModalLayout";
import { CliPoolEditor } from "./CliPoolEditor";
import { CommonDropdown } from "./CommonDropdown";
import { CliPoolCardItem } from "./CliPoolCardItem";
import { CliPoolSearchFilterBar, type CliPoolStatusFilter } from "./CliPoolSearchFilterBar";
import { CliPoolHeaderIcon } from "./CliPoolIcons";
import { useCloseOnEscape } from "./useCloseOnEscape";
import "../../styles/common/cli-pools.css";

export interface CliPoolModalProps {
  provider: CliProvider;
  accounts: Array<{
    id: string;
    email?: string;
    label: string;
    lastPlan?: string | null;
    isOAuth?: boolean;
  }>;
  isOpen: boolean;
  onClose: () => void;
}

export const CliPoolModal: React.FC<CliPoolModalProps> = ({
  provider,
  accounts,
  isOpen,
  onClose,
}) => {
  const [pools, setPools] = useState<CliRotationPoolV1[]>([]);
  const [bindings, setBindings] = useState<CliRotationBindingsV1>({
    agyActivePoolId: null,
    codexActivePoolId: null,
  });
  const [editingPool, setEditingPool] = useState<CliRotationPoolV1 | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<CliPoolStatusFilter>("all");

  useCloseOnEscape(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      const loaded = loadCliRotationPools();
      setPools(loaded);
      setBindings(loadCliRotationBindings(loaded));
      setEditingPool(null);
      setIsCreating(false);
      setSearchQuery("");
      setStatusFilter("all");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const providerPools = pools.filter((p) => p.provider === provider);
  const activePoolId = provider === "agy" ? bindings.agyActivePoolId : bindings.codexActivePoolId;

  const handleTogglePoolEnabled = (pool: CliRotationPoolV1) => {
    const nextEnabled = !pool.enabled;
    const nextPools = pools.map((p) => (p.id === pool.id ? { ...p, enabled: nextEnabled } : p));
    setPools(nextPools);
    saveCliRotationPools(nextPools);

    if (activePoolId === pool.id && !nextEnabled) {
      handleSetActive(null);
    }
  };

  const handleSavePool = (saved: CliRotationPoolV1) => {
    const nextPools = pools.some((p) => p.id === saved.id)
      ? pools.map((p) => (p.id === saved.id ? saved : p))
      : [...pools, saved];

    setPools(nextPools);
    saveCliRotationPools(nextPools);

    if (activePoolId === saved.id && !saved.enabled) {
      handleSetActive(null);
    }

    setEditingPool(null);
    setIsCreating(false);
  };

  const handleDeletePool = (id: string) => {
    const nextPools = pools.filter((p) => p.id !== id);
    setPools(nextPools);
    saveCliRotationPools(nextPools);

    if (activePoolId === id) {
      handleSetActive(null);
    }
  };

  const handleSetActive = (id: string | null) => {
    const nextBindings: CliRotationBindingsV1 = {
      ...bindings,
      [provider === "agy" ? "agyActivePoolId" : "codexActivePoolId"]: id,
    };
    setBindings(nextBindings);
    saveCliRotationBindings(nextBindings);
  };

  const activeCount = providerPools.filter((p) => p.enabled).length;
  const inactiveCount = providerPools.length - activeCount;

  const filteredPools = providerPools.filter((p) => {
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase();
      if (!p.name.toLowerCase().includes(query)) return false;
    }
    if (statusFilter === "active") {
      return p.enabled;
    }
    if (statusFilter === "inactive") {
      return !p.enabled;
    }
    return true;
  });

  const isEditorView = Boolean(editingPool || isCreating);
  const title = isEditorView
    ? isCreating
      ? `New ${provider === "agy" ? "Antigravity" : "Codex"} Pool`
      : `Edit Pool: ${editingPool?.name}`
    : provider === "agy"
      ? "Antigravity CLI Account Pools"
      : "ChatGPT Codex CLI Account Pools";

  const footerButtons = isEditorView ? (
    <>
      <button
        type="button"
        className="dialog-btn dialog-btn--secondary"
        onClick={() => {
          setEditingPool(null);
          setIsCreating(false);
        }}
        data-tooltip="Cancel pool editing"
      >
        Cancel
      </button>
      <button
        type="submit"
        form="cli-pool-form"
        className="dialog-btn"
        data-tooltip="Save CLI rotation pool"
      >
        Save Pool
      </button>
    </>
  ) : (
    <button
      type="button"
      className="dialog-btn dialog-btn--secondary"
      onClick={onClose}
      data-tooltip="Close CLI pools modal"
    >
      Close
    </button>
  );

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={<CliPoolHeaderIcon />}
      dialogClassName="dialog-box--cli-pool"
      footerButtons={footerButtons}
    >
      {isEditorView ? (
        <CliPoolEditor
          provider={provider}
          pool={editingPool}
          accounts={accounts}
          onSave={handleSavePool}
          onCancel={() => {
            setEditingPool(null);
            setIsCreating(false);
          }}
          formId="cli-pool-form"
          hideFooterButtons
        />
      ) : (
        <div className="cli-pool-modal-body-content">
          <div className="cli-pool-toolbar">
            <div className="cli-pool-active-selector">
              <span className="cli-pool-active-label">Active Pool:</span>
              <CommonDropdown
                id="cli-pool-active-select"
                value={activePoolId ?? ""}
                onChange={(val) => handleSetActive(val || null)}
                ariaLabel="Select active rotation pool"
                tooltip="Select active rotation pool"
                options={[
                  { value: "", label: "None (Disabled)" },
                  ...providerPools
                    .filter((p) => p.enabled)
                    .map((p) => ({
                      value: p.id,
                      label: p.name,
                      sublabel: `(${p.accountIds.length} accounts)`,
                    })),
                ]}
              />
            </div>
            <button
              type="button"
              data-tooltip="Create a new CLI account pool"
              className="dialog-btn"
              onClick={() => setIsCreating(true)}
            >
              + New Pool
            </button>
          </div>

          <CliPoolSearchFilterBar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            totalCount={providerPools.length}
            activeCount={activeCount}
            inactiveCount={inactiveCount}
          />

          {providerPools.length === 0 ? (
            <div className="cli-pool-empty">
              <span className="cli-pool-empty-title">
                No CLI pools configured for {provider === "agy" ? "Antigravity" : "Codex"}.
              </span>
              <span className="cli-pool-empty-desc">
                Click <strong>+ New Pool</strong> above to create a rotation pool.
              </span>
            </div>
          ) : filteredPools.length === 0 ? (
            <div className="cli-pool-empty">
              <span className="cli-pool-empty-title">No pools match your search or filter.</span>
              <button
                type="button"
                className="account-action-btn"
                style={{ marginTop: "6px", alignSelf: "center" }}
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                }}
                data-tooltip="Reset search and status filter"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="cli-pool-card-grid">
              {filteredPools.map((p) => (
                <CliPoolCardItem
                  key={p.id}
                  pool={p}
                  isActive={activePoolId === p.id}
                  onToggleEnabled={handleTogglePoolEnabled}
                  onEdit={(target) => setEditingPool(target)}
                  onDelete={handleDeletePool}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </AccountModalLayout>
  );
};
