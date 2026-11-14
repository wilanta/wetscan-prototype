"use client";
import { useState } from "react";
import type { ArchitectureGraph } from "../types";
export function EvidencePanel({
  graph,
  ids,
}: {
  graph: ArchitectureGraph;
  ids: string[];
}) {
  const [copied, setCopied] = useState("");
  return (
    <section aria-label="Supporting evidence">
      <h3>Why this is on the map</h3>
      <p className="small-text">
        Verified means this source observation is supported. It does not verify
        deployment, connectivity or security. Inferred means likely but
        unconfirmed.
      </p>
      {ids.length ? (
        ids.map((id) => {
          const e = graph.evidence.find((e) => e.id === id);
          if (!e) return null;
          const location = e.sourcePath
            ? `${e.sourcePath}${e.startLine ? `:${e.startLine}` : ""}`
            : "Manual / synthetic definition";
          return (
            <div className="inspector-finding" key={id}>
              <strong>{e.origin.replace("_", " ")}</strong>
              <p>{e.summary}</p>
              <code style={{ overflowWrap: "anywhere" }}>{location}</code>
              {e.sourcePath && (
                <button
                  className="button secondary"
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(location)
                      .then(() =>
                        setCopied("Repository-relative location copied."),
                      )
                      .catch(() => setCopied(`Copy manually: ${location}`));
                  }}
                >
                  Copy source location
                </button>
              )}
              {e.sourceRevision && <small>Revision: {e.sourceRevision}</small>}
            </div>
          );
        })
      ) : (
        <p>User-added context. No generated source evidence.</p>
      )}
      <p role="status">{copied}</p>
    </section>
  );
}
