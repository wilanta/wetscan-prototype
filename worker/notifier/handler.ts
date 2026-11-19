import type { JobLease } from "../../src/features/sentinel/platform-contracts";
import type { SenderStore } from "../../src/features/sentinel/notifications/sender-store";
import type {
  NotificationChannel,
  SenderPort,
} from "../../src/features/sentinel/notifications/model";

/**
 * One leased outbox job → at most one provider call. The ledger is moved to `attempted` (committed) BEFORE the call and
 * settled after it; a crash in between is recovered as `previous_attempt_outcome_unknown`, never as a phantom delivery.
 */
export async function processLease(
  store: SenderStore,
  senders: ReadonlyMap<NotificationChannel, SenderPort>,
  current: () => JobLease,
  signal: AbortSignal,
) {
  const prepared = await store.prepare(current());
  if (prepared.kind === "done") return;
  if (prepared.kind === "resume_accepted") {
    await store.settle(current(), prepared, undefined);
    return;
  }
  const sender = senders.get(prepared.channel);
  const outcome = sender
    ? await sender.send(
        {
          destination: prepared.destination,
          text: prepared.text,
          subject: prepared.subject,
          deliveryId: prepared.deliveryId,
        },
        signal,
      )
    : undefined;
  await store.settle(current(), prepared, outcome);
}
