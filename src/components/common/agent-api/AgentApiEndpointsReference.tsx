import React, { useEffect, useId, useRef, useState } from "react";

interface EndpointSpec {
  method: "GET" | "POST";
  path: string;
  summary: string;
  params: string;
  requestSample?: string;
  responseStatus: string;
  responseSample: string;
}

const ENDPOINTS: EndpointSpec[] = [
  {
    method: "GET",
    path: "/v1/accounts",
    summary: "List synced accounts and quota percentages.",
    params: "None",
    responseStatus: "200 OK",
    responseSample: `{
  "accounts": [
    {
      "id": "acc-1",
      "provider": "codex",
      "remainingPercent": 82.5,
      "usedPercent": 17.5,
      "resetAt": "2026-11-16T00:00:00Z",
      "updatedAt": "2026-11-15T12:00:00Z"
    }
  ]
}`,
  },
  {
    method: "GET",
    path: "/v1/pools",
    summary: "List configured account rotation pools.",
    params: "None",
    responseStatus: "200 OK",
    responseSample: `{
  "pools": [
    {
      "id": "pool-main",
      "provider": "codex",
      "accountIds": ["acc-1", "acc-2"],
      "enabled": true,
      "active": true
    }
  ]
}`,
  },
  {
    method: "POST",
    path: "/v1/rotation",
    summary: "Rotate active account (requires Allow account rotation).",
    params:
      'Body JSON: mode ("auto" | "account"), provider ("codex" | "agy" | "antigravity"), optional poolId (string), accountId (required if mode = "account")',
    requestSample: `{
  "mode": "auto",
  "provider": "codex",
  "poolId": "pool-main"
}`,
    responseStatus: "202 Accepted",
    responseSample: `{
  "operationId": "op-123",
  "provider": "codex",
  "accountId": "acc-1",
  "status": "pending",
  "updatedAt": "2026-11-15T12:00:00Z"
}`,
  },
  {
    method: "GET",
    path: "/v1/operations/{id}",
    summary: "Inspect status of a queued or completed rotation.",
    params: "Path: id (operationId)",
    responseStatus: "200 OK",
    responseSample: `{
  "operationId": "op-123",
  "provider": "codex",
  "accountId": "acc-1",
  "status": "pending",
  "updatedAt": "2026-11-15T12:00:00Z"
}`,
  },
];

interface AgentApiEndpointsReferenceProps {
  baseUrl: string;
}

/**
 * Collapsible reference panel showing all local Agent API endpoints,
 * request parameters, and sample JSON payloads below the Endpoint row.
 */
export const AgentApiEndpointsReference: React.FC<AgentApiEndpointsReferenceProps> = ({
  baseUrl,
}) => {
  const [expanded, setExpanded] = useState(false);
  const wasExpandedRef = useRef(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const contentId = useId();
  const displayBase = baseUrl || "http://localhost:<port>";

  useEffect(() => {
    if (wasExpandedRef.current && !expanded) {
      toggleRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    }
    wasExpandedRef.current = expanded;
  }, [expanded]);

  return (
    <div className="agent-api-endpoints">
      <button
        ref={toggleRef}
        type="button"
        className="agent-api-endpoints-toggle"
        aria-expanded={expanded}
        aria-controls={contentId}
        data-tooltip={
          expanded
            ? "Hide API endpoints reference"
            : "Show API endpoints, parameters, and sample responses"
        }
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="agent-api-endpoints-title">
          <strong>API endpoints ({ENDPOINTS.length})</strong>
          <span>Bearer auth · JSON</span>
        </span>
        <svg
          className={`agent-api-endpoints-caret ${expanded ? "open" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div id={contentId} className="agent-api-endpoints-list">
          <p className="agent-api-endpoints-auth">
            Headers: <code>Authorization: Bearer &lt;QUOTASHIFT_AGENT_API_KEY&gt;</code>
            {" · "}
            <code>Host: localhost / 127.0.0.1</code> (no <code>Origin</code> header, body &lt;= 4096
            B). Base: <code>{displayBase}</code>
          </p>

          {ENDPOINTS.map((endpoint) => (
            <div key={endpoint.path} className="agent-api-endpoint-item">
              <div className="agent-api-endpoint-head">
                <span
                  className={`agent-api-method agent-api-method--${endpoint.method.toLowerCase()}`}
                >
                  {endpoint.method}
                </span>
                <code className="agent-api-endpoint-path">{endpoint.path}</code>
              </div>
              <p className="agent-api-endpoint-summary">{endpoint.summary}</p>
              <div className="agent-api-endpoint-params">
                <span>Params:</span> {endpoint.params}
              </div>
              {endpoint.requestSample && (
                <div className="agent-api-sample">
                  <span>Request body</span>
                  <pre className="agent-api-command">
                    <code>{endpoint.requestSample}</code>
                  </pre>
                </div>
              )}
              <div className="agent-api-sample">
                <span>Sample response ({endpoint.responseStatus})</span>
                <pre className="agent-api-command">
                  <code>{endpoint.responseSample}</code>
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
