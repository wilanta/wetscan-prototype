"use client";
import { useState } from "react";
import { Button, Notice } from "@/components/ui";
import { allowDast } from "./security";
export function DastScopeForm() {
  const [origin, setOrigin] = useState(""),
    [path, setPath] = useState("/"),
    [consent, setConsent] = useState(false),
    [message, setMessage] = useState("");
  return (
    <details>
      <summary>Review a staging scope draft</summary>
      <p>
        Configuration preview only. Ownership proof and safe outbound runner are
        unavailable (GRD-011/012); saving does not authorize or run requests.
      </p>
      <label className="field">
        Staging HTTPS origin
        <input
          type="url"
          placeholder="https://staging.example.com"
          value={origin}
          onChange={(e) => {
            setOrigin(e.target.value);
            setMessage("");
          }}
        />
      </label>
      <label className="field">
        Exact allowed path
        <input
          value={path}
          onChange={(e) => {
            setPath(e.target.value);
            setMessage("");
          }}
        />
      </label>
      <p>
        Proposed limits: GET/HEAD, 1 request/second, concurrency 1, timeout 10
        seconds, approval window 30 minutes, dummy accounts only. Destructive
        methods and production are excluded.
      </p>
      <label className="check-line">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        This is a staging scope I am authorized to propose
      </label>
      <Button
        variant="secondary"
        disabled={!consent || !origin || !path}
        onClick={async () => {
          await allowDast(
            {
              environment: "staging",
              origin,
              paths: [path],
              methods: ["GET", "HEAD"],
              consentActor: "demo-draft-only",
              proofId: "unverified-draft",
              expiresAt: Date.now() + 1800000,
              requestsPerSecond: 1,
              concurrency: 1,
              timeoutMs: 10000,
              syntheticAccounts: true,
            },
            { ready: false, validate: async () => false },
          ).catch(() =>
            setMessage(
              "NOT_EXECUTED: DAST disabled. Server-verified ownership, consent, an isolated runner and DNS/IP/redirect enforcement are required. No request was sent.",
            ),
          );
        }}
      >
        Check scope readiness
      </Button>
      {message && <p role="status">{message}</p>}
      <Notice tone="neutral">
        This draft is not persisted. Never place account credentials or customer
        data in this form.
      </Notice>
    </details>
  );
}
