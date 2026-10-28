import React from "react";

export type CliPoolStatusFilter = "all" | "active" | "inactive";

export interface CliPoolSearchFilterBarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  statusFilter: CliPoolStatusFilter;
  onStatusFilterChange: (status: CliPoolStatusFilter) => void;
  totalCount: number;
  activeCount: number;
  inactiveCount: number;
}

export const CliPoolSearchFilterBar: React.FC<CliPoolSearchFilterBarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  totalCount,
  activeCount,
  inactiveCount,
}) => {
  return (
    <div className="cli-pool-search-filter-bar">
      <div className="cli-pool-search-wrap">
        <input
          type="text"
          className="cli-pool-search-input"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search pool name…"
          aria-label="Search pool name"
        />
        {searchQuery && (
          <button
            type="button"
            className="cli-pool-search-clear-btn"
            onClick={() => onSearchChange("")}
            data-tooltip="Clear search"
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>
      <div
        className="cli-pool-status-filter-group"
        role="radiogroup"
        aria-label="Filter pools by status"
      >
        <button
          type="button"
          className={`cli-pool-filter-pill ${statusFilter === "all" ? "cli-pool-filter-pill--active" : ""}`}
          onClick={() => onStatusFilterChange("all")}
          data-tooltip="Show all pools"
          aria-checked={statusFilter === "all"}
          role="radio"
        >
          All ({totalCount})
        </button>
        <button
          type="button"
          className={`cli-pool-filter-pill ${statusFilter === "active" ? "cli-pool-filter-pill--active" : ""}`}
          onClick={() => onStatusFilterChange("active")}
          data-tooltip="Show active and enabled pools"
          aria-checked={statusFilter === "active"}
          role="radio"
        >
          Active ({activeCount})
        </button>
        <button
          type="button"
          className={`cli-pool-filter-pill ${statusFilter === "inactive" ? "cli-pool-filter-pill--active" : ""}`}
          onClick={() => onStatusFilterChange("inactive")}
          data-tooltip="Show unactive and disabled pools"
          aria-checked={statusFilter === "inactive"}
          role="radio"
        >
          Unactive ({inactiveCount})
        </button>
      </div>
    </div>
  );
};
