export type PilotActionPhase = "IDLE" | "WORKING" | "SUCCESS" | "FAILURE";
export type PilotActionFeedback = { key: string; phase: PilotActionPhase; message: string };

export function beginPilotAction(state: PilotActionFeedback, key: string, message: string) {
  if (state.phase === "WORKING") return false;
  Object.assign(state, { key, phase: "WORKING", message });
  return true;
}

export function settlePilotAction(state: PilotActionFeedback, key: string, phase: "SUCCESS" | "FAILURE", message: string) {
  if (state.key !== key || state.phase !== "WORKING") return false;
  Object.assign(state, { phase, message });
  return true;
}
