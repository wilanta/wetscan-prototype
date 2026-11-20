/** Nested preparation budgets for the existing 45s source policy; Auth expiry/lease checks stay authoritative. */
export const guardPreparationTiming = Object.freeze({
  rpcMs: 55000,
  handlerMs: 60000,
  requestMs: 90000,
});
