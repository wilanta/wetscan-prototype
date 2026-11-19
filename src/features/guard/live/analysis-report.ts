import { reportHtml } from "../release";
import type { StoredGuardReport } from "./product-artifacts";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function analysisReportHtml(body: StoredGuardReport["body"]) {
  const section =
    "<h2>Remediation advice and review</h2><p>Advice is untrusted; no patch or verified fix is implied.</p><pre>" +
    escape(JSON.stringify(body.remediation ?? [], null, 2)) +
    "</pre><h2>Recorded retest comparisons</h2><pre>" +
    escape(JSON.stringify(body.retests ?? [], null, 2)) +
    "</pre><h2>Integration producer envelopes</h2><p>Pending delivery is not consumer acknowledgment or enforcement.</p><pre>" +
    escape(JSON.stringify(body.integrations ?? [], null, 2)) +
    "</pre>";
  return reportHtml(body).replace("</body>", section + "</body>");
}
