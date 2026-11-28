import React, { useEffect, useMemo, useState } from "react";
import { AccountModalLayout } from "../accounts/AccountModalLayout";
import { CustomDialog } from "../dialogs/CustomDialog";
import { useCloseOnEscape } from "../dialogs/useCloseOnEscape";
import { MonitoredAccountsIcon, UntrackAllIcon } from "../header/HeaderIcons";
import { PlatformBrandIcon } from "../icons/PlatformBrandIcon";
import { usePointerCardReorder } from "../../../hooks/accounts/usePointerCardReorder";
import { clearMonitoredOverlayState } from "../../../hooks/app/tracking/overlayTrackedExtras";
import {
  TRACKED_IDS_CHANGED_EVENT,
  clearTrackedAccounts,
  loadMultiTrackEnabled,
  loadTrackedList,
  reorderTrackedAccounts,
  untrackAccount,
  type TrackedEntry,
} from "../../../utils/common/accounts/tracked-accounts";
import {
  OPEN_MONITORED_ACCOUNTS_MODAL_EVENT,
  resolveMonitoredAccountItems,
  sortMonitoredAccountItems,
  type MonitoredAccountItem,
  type MonitoredAccountSources,
  type MonitoredSortDirection,
  type MonitoredSortField,
} from "../../../utils/common/accounts/monitored-accounts-modal";
import {
  MonitoredDragHandleIcon,
  MonitoredSortArrowIcon,
  MonitoredUntrackItemIcon,
} from "./MonitoredRowIcons";
import { useFloatingDragRow } from "./useFloatingDragRow";
import { tierBadgeSlug } from "../../../utils/common/accounts/tier-badge-slug";

const SORT_OPTIONS: ReadonlyArray<{ field: MonitoredSortField; label: string }> = [
  { field: "platform", label: "Platform" },
  { field: "alias", label: "Alias" },
  { field: "email", label: "Email" },
  { field: "tier", label: "Tier" },
];

export type MonitoredAccountsModalProps = MonitoredAccountSources;

export const MonitoredAccountsModal: React.FC<MonitoredAccountsModalProps> = ({
  antigravityAccounts,
  antigravityUsageCache,
  codexAccounts,
  codexUsageCache,
  claudeAccountStatuses,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [entries, setEntries] = useState<TrackedEntry[]>(() => loadTrackedList());
  const [activeSort, setActiveSort] = useState<{
    field: MonitoredSortField;
    direction: MonitoredSortDirection;
  } | null>(null);

  useEffect(() => {
    const syncEntries = () => {
      setEntries(loadTrackedList());
      if (!loadMultiTrackEnabled()) setIsOpen(false);
    };
    const handleOpen = () => {
      if (!loadMultiTrackEnabled()) return;
      syncEntries();
      setConfirmOpen(false);
      setIsOpen(true);
    };
    window.addEventListener(OPEN_MONITORED_ACCOUNTS_MODAL_EVENT, handleOpen);
    window.addEventListener(TRACKED_IDS_CHANGED_EVENT, syncEntries);
    window.addEventListener("storage", syncEntries);
    return () => {
      window.removeEventListener(OPEN_MONITORED_ACCOUNTS_MODAL_EVENT, handleOpen);
      window.removeEventListener(TRACKED_IDS_CHANGED_EVENT, syncEntries);
      window.removeEventListener("storage", syncEntries);
    };
  }, []);

  const items = useMemo(
    () =>
      resolveMonitoredAccountItems(entries, {
        antigravityAccounts,
        antigravityUsageCache,
        codexAccounts,
        codexUsageCache,
        claudeAccountStatuses,
      }),
    [
      entries,
      antigravityAccounts,
      antigravityUsageCache,
      codexAccounts,
      codexUsageCache,
      claudeAccountStatuses,
    ],
  );

  const commitOrder = (nextEntries: TrackedEntry[]) => {
    const updated = reorderTrackedAccounts(nextEntries);
    setEntries(updated);
    window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
  };

  const handleManualReorder = (orderedIds: string[]) => {
    const byId = new Map<string, MonitoredAccountItem>(items.map((item) => [item.id, item]));
    const nextEntries = orderedIds
      .map((id) => byId.get(id)?.entry)
      .filter((entry): entry is TrackedEntry => Boolean(entry));
    setActiveSort(null);
    commitOrder(nextEntries);
  };

  const { draggingId, containerRef, displayedItems, handlePointerDown } = usePointerCardReorder(
    items,
    handleManualReorder,
  );
  const { dragFloat, clearDragFloat, handleRowPointerDown } = useFloatingDragRow(
    containerRef,
    handlePointerDown,
  );

  const closeModal = () => {
    setConfirmOpen(false);
    clearDragFloat();
    setIsOpen(false);
  };

  useCloseOnEscape(isOpen && !confirmOpen, closeModal);

  const handleQuickSort = (field: MonitoredSortField) => {
    const nextDirection: MonitoredSortDirection =
      activeSort?.field === field && activeSort.direction === "asc" ? "desc" : "asc";
    const sorted = sortMonitoredAccountItems(items, field, nextDirection);
    setActiveSort({ field, direction: nextDirection });
    commitOrder(sorted.map((item) => item.entry));
  };

  const handleUntrackOne = (entry: TrackedEntry) => {
    const remaining = untrackAccount(entry);
    if (remaining.length === 0) {
      clearMonitoredOverlayState();
      setIsOpen(false);
    }
    setEntries(remaining);
    window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
  };

  const handleUntrackAll = () => {
    clearTrackedAccounts();
    clearMonitoredOverlayState();
    window.dispatchEvent(new CustomEvent(TRACKED_IDS_CHANGED_EVENT));
    setEntries([]);
    closeModal();
  };

  const sortHeaderActions = (
    <div className="monitored-sort-chips" role="group" aria-label="Quick sort monitored accounts">
      {SORT_OPTIONS.map(({ field, label }) => {
        const isActive = activeSort?.field === field;
        return (
          <button
            key={field}
            type="button"
            className={`monitored-sort-chip${isActive ? " is-active" : ""}`}
            aria-pressed={isActive}
            disabled={displayedItems.length < 2}
            data-tooltip={
              isActive
                ? `Sorted by ${label.toLowerCase()} (${activeSort.direction === "asc" ? "ascending" : "descending"})`
                : `Sort by ${label.toLowerCase()}`
            }
            onClick={() => handleQuickSort(field)}
          >
            <span>{label}</span>
            {isActive && (
              <span className="monitored-sort-dir">
                <MonitoredSortArrowIcon direction={activeSort.direction} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  const renderRowBody = (item: MonitoredAccountItem, index: number, interactive: boolean) => (
    <>
      <span className="monitored-drag-handle" aria-hidden="true">
        <MonitoredDragHandleIcon />
      </span>
      <div className="monitored-rank-col">
        <span className="monitored-order-badge">#{index + 1}</span>
        <span className="monitored-platform-icon" aria-label={item.platformLabel}>
          <PlatformBrandIcon platform={item.platform} />
        </span>
      </div>
      <div className="monitored-account-main">
        <div className="monitored-account-top">
          <span className="monitored-account-alias">{item.alias}</span>
          <span
            className={`account-tier-badge account-tier-badge--${tierBadgeSlug(item.tier)}`}
            data-provider={item.platform}
          >
            <span className="account-tier-badge-label">{item.tier}</span>
          </span>
        </div>
        <div className="monitored-account-meta">
          <span className="monitored-account-email">{item.email}</span>
        </div>
      </div>
      <button
        type="button"
        className="monitored-untrack-item-btn"
        data-tooltip={`Untrack ${item.alias}`}
        aria-label={`Untrack ${item.alias}`}
        tabIndex={interactive ? undefined : -1}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={interactive ? () => handleUntrackOne(item.entry) : undefined}
      >
        <MonitoredUntrackItemIcon />
      </button>
    </>
  );

  const floatingIdx = draggingId ? displayedItems.findIndex((item) => item.id === draggingId) : -1;
  const floatingItem = floatingIdx >= 0 ? displayedItems[floatingIdx] : null;

  const footerButtons = (
    <div className="monitored-modal-footer">
      <button
        type="button"
        className="dialog-btn dialog-btn--danger monitored-untrack-all-btn"
        onClick={() => setConfirmOpen(true)}
        disabled={displayedItems.length === 0}
        data-tooltip="Untrack all monitored accounts"
      >
        <UntrackAllIcon />
        <span>Untrack All</span>
      </button>
      <button
        type="button"
        className="dialog-btn dialog-btn--secondary"
        onClick={closeModal}
        data-tooltip="Close monitored accounts manager"
      >
        Done
      </button>
    </div>
  );

  return (
    <>
      <AccountModalLayout
        isOpen={isOpen}
        onClose={closeModal}
        title={`Monitored Accounts - ${displayedItems.length}`}
        icon={<MonitoredAccountsIcon />}
        headerActions={sortHeaderActions}
        dialogClassName="monitored-accounts-dialog"
        footerButtons={footerButtons}
      >
        {displayedItems.length === 0 ? (
          <div className="monitored-empty-state">No monitored accounts selected.</div>
        ) : (
          <div ref={containerRef} className="monitored-accounts-list">
            {displayedItems.map((item, index) => (
              <div
                key={item.id}
                data-sortable-account-id={item.id}
                className={`monitored-account-row${draggingId === item.id ? " is-dragging is-drag-target-ghost" : ""}`}
                onPointerDown={(e) => handleRowPointerDown(e, item.id)}
              >
                {renderRowBody(item, index, true)}
              </div>
            ))}
            {floatingItem && dragFloat && dragFloat.id === floatingItem.id && (
              <div
                aria-hidden="true"
                className="monitored-account-row is-drag-floating"
                style={{
                  top: dragFloat.pointerY - dragFloat.offsetY - dragFloat.listTop,
                  height: dragFloat.height,
                }}
              >
                {renderRowBody(floatingItem, floatingIdx, false)}
              </div>
            )}
          </div>
        )}
      </AccountModalLayout>
      {confirmOpen && (
        <CustomDialog
          title="Untrack All Accounts"
          message="Untrack all monitored accounts from the overlay and taskbar?"
          isConfirm
          confirmText="Untrack All"
          cancelText="Cancel"
          confirmVariant="danger"
          confirmTooltip="Untrack all accounts"
          cancelTooltip="Cancel"
          onClose={(confirmed) => {
            if (confirmed) handleUntrackAll();
            else setConfirmOpen(false);
          }}
        />
      )}
    </>
  );
};
