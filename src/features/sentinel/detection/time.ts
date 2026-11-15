import { timestamp } from "../telemetry/validation";

/** Preserve PostgreSQL microseconds across JS Date's millisecond boundary. */
export function preciseTime(value: unknown) {
  const normalized = timestamp(value);
  const fraction = (value as string).match(/\.(\d+)Z$/)?.[1] ?? "";
  return `${normalized.slice(0, 19)}.${fraction.padEnd(6, "0")}Z`;
}
export function micros(value: string) {
  const exact = preciseTime(value);
  return BigInt(Date.parse(exact)) * 1000n + BigInt(exact.slice(-4, -1));
}
