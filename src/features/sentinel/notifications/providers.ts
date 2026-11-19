import { readFile } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  notificationLimits,
  type NotificationChannel,
  type SendOutcome,
  type SenderPort,
} from "./model";

/**
 * Provider adapters. ONLY the credential-isolated notifier process (worker/notifier) may import and construct these:
 * the main Sentinel worker deletes TELEGRAM_/RESEND_/WHATSAPP_ env and never touches this module.
 * Errors are reduced to fixed codes; URLs, tokens, response bodies and exception messages are never returned or logged.
 */
export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/** Reads `<NAME>_FILE` (absolute path, preferred) or `<NAME>`; re-read every `ttlMs` so rotation/revocation applies without restart. */
export function secretReader(
  env: Readonly<Record<string, string | undefined>>,
  name: string,
  ttlMs = 15000,
) {
  let cached: { at: number; value: string | undefined } | undefined;
  return async (): Promise<string | undefined> => {
    if (cached && Date.now() - cached.at < ttlMs) return cached.value;
    let value: string | undefined;
    const file = env[`${name}_FILE`];
    try {
      if (file)
        value = isAbsolute(file)
          ? (await readFile(file, "utf8")).trim()
          : undefined;
      else value = env[name]?.trim();
    } catch {
      value = undefined;
    }
    if (
      value !== undefined &&
      (!value || /[\r\n\0]/.test(value) || value.length > 512)
    )
      value = undefined;
    cached = { at: Date.now(), value };
    return value;
  };
}
async function readBounded(res: Response, max: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      throw new Error("too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
const deadline = (signal: AbortSignal) =>
  AbortSignal.any([signal, AbortSignal.timeout(notificationLimits.timeoutMs)]);
const parse = (text: string): Record<string, unknown> => {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
};
/** A base URL override is honoured only for a loopback mock server (acceptance tests); real traffic is https-only. */
export function safeBase(real: string, override: string | undefined): string {
  if (!override) return real;
  return /^http:\/\/(127\.0\.0\.1|\[::1\]):[1-9][0-9]{3,4}$/.test(override)
    ? override
    : real;
}

export class TelegramSender implements SenderPort {
  readonly channel = "telegram" as const;
  constructor(
    private readonly o: {
      token: () => Promise<string | undefined>;
      baseUrl?: string;
      fetchImpl?: Fetch;
    },
  ) {}
  async send(
    input: { destination: string; text: string },
    signal: AbortSignal,
  ): Promise<SendOutcome> {
    const token = await this.o.token();
    if (!token || !/^\d{5,12}:[A-Za-z0-9_-]{30,}$/.test(token))
      return { kind: "not_configured" };
    const base = safeBase("https://api.telegram.org", this.o.baseUrl);
    let res: Response, body: Record<string, unknown>;
    try {
      res = await (this.o.fetchImpl ?? fetch)(
        `${base}/bot${token}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: input.destination,
            text: input.text.slice(0, 4096),
            disable_web_page_preview: true,
          }),
          signal: deadline(signal),
          redirect: "error",
        },
      );
      body = parse(await readBounded(res, notificationLimits.responseBytes));
    } catch {
      // Request may or may not have reached Telegram: outcome is ambiguous, never reported as failure-with-certainty.
      return { kind: "retryable", code: "network_or_timeout", ambiguous: true };
    }
    if (res.status === 200 && body.ok === true) {
      const id = (body.result as { message_id?: unknown } | undefined)
        ?.message_id;
      if (typeof id === "number" && Number.isSafeInteger(id))
        return {
          kind: "accepted",
          providerMessageId: String(id),
          acceptedAt: new Date().toISOString(),
        };
      return { kind: "permanent", code: "malformed_provider_response" };
    }
    if (res.status === 429) {
      const wait = Number(
        (body.parameters as { retry_after?: unknown } | undefined)?.retry_after,
      );
      return {
        kind: "retryable",
        code: "rate_limited",
        retryAfterMs:
          Number.isFinite(wait) && wait > 0 ? wait * 1000 : undefined,
      };
    }
    if (res.status >= 500) return { kind: "retryable", code: "provider_5xx" };
    if (res.status === 401)
      return { kind: "permanent", code: "provider_auth_failed" };
    if (res.status === 403)
      return { kind: "permanent", code: "recipient_forbidden" };
    if (res.status === 400 || res.status === 404)
      return { kind: "permanent", code: "destination_rejected" };
    return { kind: "permanent", code: "provider_rejected" };
  }
}

/** Optional email adapter (H05). Provider acceptance is NOT mailbox delivery; no delivery callbacks are implemented. */
export class ResendSender implements SenderPort {
  readonly channel = "email" as const;
  constructor(
    private readonly o: {
      apiKey: () => Promise<string | undefined>;
      from: string | undefined;
      baseUrl?: string;
      fetchImpl?: Fetch;
    },
  ) {}
  async send(
    input: {
      destination: string;
      text: string;
      subject: string;
      deliveryId: string;
    },
    signal: AbortSignal,
  ): Promise<SendOutcome> {
    const key = await this.o.apiKey();
    const from = this.o.from;
    if (
      !key ||
      !/^re_[A-Za-z0-9_-]{16,}$/.test(key) ||
      !from ||
      !/^([A-Za-z0-9 ._-]{1,60}<[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+>|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+)$/.test(
        from,
      )
    )
      return { kind: "not_configured" };
    const base = safeBase("https://api.resend.com", this.o.baseUrl);
    let res: Response, body: Record<string, unknown>;
    try {
      res = await (this.o.fetchImpl ?? fetch)(`${base}/emails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "Idempotency-Key": input.deliveryId,
        },
        body: JSON.stringify({
          from,
          to: [input.destination],
          subject: input.subject.slice(0, 200),
          text: input.text,
        }),
        signal: deadline(signal),
        redirect: "error",
      });
      body = parse(await readBounded(res, notificationLimits.responseBytes));
    } catch {
      return { kind: "retryable", code: "network_or_timeout", ambiguous: true };
    }
    if (
      res.status === 200 &&
      typeof body.id === "string" &&
      /^[A-Za-z0-9-]{8,128}$/.test(body.id)
    )
      return {
        kind: "accepted",
        providerMessageId: body.id,
        acceptedAt: new Date().toISOString(),
      };
    if (res.status === 429) {
      const wait = Number(res.headers.get("retry-after"));
      return {
        kind: "retryable",
        code: "rate_limited",
        retryAfterMs:
          Number.isFinite(wait) && wait > 0 ? wait * 1000 : undefined,
      };
    }
    if (res.status >= 500) return { kind: "retryable", code: "provider_5xx" };
    if (res.status === 401 || res.status === 403)
      return { kind: "permanent", code: "provider_auth_failed" };
    return { kind: "permanent", code: "provider_rejected" };
  }
}
/** WhatsApp has no sender: unavailable until official Meta setup + H06 consent. */
export const providerStatus = (
  senders: ReadonlyMap<NotificationChannel, SenderPort>,
) => ({
  telegram: senders.has("telegram") ? "adapter_loaded" : "not_configured",
  email: senders.has("email") ? "adapter_loaded" : "not_configured",
  whatsapp: "requires_business_setup",
});
