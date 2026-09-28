import { reactive } from "vue";
import axios from "@/utils/axios";

export type UnitScope = { projectId: number; scriptId: number; generation: number };
export type RevisionOperation = Record<string, unknown> & { type: "EDIT" | "ADD" | "RETIRE" | "REORDER" };
type Proposal = { proposalId: string; projectId: number; scriptId: number; kind: "ADD" | "REPLACE"; candidate: any; baseline?: string };
type Bindings = { current: () => UnitScope | null; isCurrent: (scope: UnitScope | null) => boolean;
  invalidate: () => void; refresh: () => Promise<void> };

const state = reactive({ mode: "LOADING" as "LOADING" | "CONTROLLED_V2" | "CONFIG_BLOCKED" | "LEGACY",
  scope: null as UnitScope | null, status: "IDLE" as string, error: "", revisionId: "",
  draft: null as { origin: string; operations: RevisionOperation[] } | null, dialogOpen: false,
  preview: null as any, confirmBody: null as any, humanReason: "", proposal: null as Proposal | null,
  applied: null as any });
let bindings: Bindings | null = null;
const post = async (path: string, body: unknown): Promise<any> => (await axios.post(path, body)).data;
const reason = (error: any) => error?.data?.reason as string | undefined;
const same = (left: UnitScope | null, right: UnitScope | null) => !!left && !!right &&
  left.projectId === right.projectId && left.scriptId === right.scriptId && left.generation === right.generation;
const current = (scope: UnitScope | null) => !!bindings && bindings.isCurrent(scope) && same(scope, state.scope);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

async function resolveMode(scope: UnitScope) {
  state.mode = "LOADING";
  try {
    const profile = await post("/productionProfiles/resolve", { projectId: scope.projectId });
    if (!current(scope)) return;
    const controlled = profile.managed && profile.definition?.schemaVersion === 2 &&
      profile.definition.stages?.some((stage: any) => stage.stageKey === "storyboard-board");
    if (!controlled) { state.mode = "LEGACY"; return; }
    try {
      const review = await post("/supervisor/current/resolve", { projectId: scope.projectId, scriptId: scope.scriptId });
      if (!current(scope)) return;
      state.mode = review.gateDriving && review.targetAdapterKey === "storyboard.semantic.v2" ? "CONTROLLED_V2" : "CONFIG_BLOCKED";
      if (state.mode === "CONFIG_BLOCKED") state.error = "当前 Production Profile 的 Semantic V2 审核配置不可用。";
    } catch (error: any) {
      if (current(scope)) { state.mode = "CONFIG_BLOCKED"; state.error = error?.message || "审核配置不可用"; }
    }
  } catch (error: any) {
    if (current(scope)) { state.mode = "CONFIG_BLOCKED"; state.error = error?.message || "无法解析 Production Profile"; }
  }
}

function bind(next: Bindings) { bindings = next; }
function setScope(scope: UnitScope) {
  if (same(scope, state.scope)) return;
  const changedUnit = !state.scope || scope.projectId !== state.scope.projectId || scope.scriptId !== state.scope.scriptId;
  state.scope = { ...scope };
  if (changedUnit) {
    state.draft = null; state.dialogOpen = false; state.preview = null; state.confirmBody = null; state.proposal = null;
    state.status = "IDLE"; state.applied = null; state.error = "";
    void resolveMode(scope);
  }
}
function maySwitch() { return state.status !== "CONFIRMING" && state.status !== "REFRESH_PENDING" && (state.status !== "PREVIEWED" || !state.draft ||
  window.confirm("当前修订尚未确认。确定丢弃草稿并切换制作单元吗？")); }
function discard() { state.draft = null; state.dialogOpen = false; state.preview = null; state.confirmBody = null; state.status = "IDLE"; state.error = ""; }
function close() { if (state.status !== "CONFIRMING") state.dialogOpen = false; }
function open(origin: string, operations: RevisionOperation[]) {
  if (state.mode !== "CONTROLLED_V2" || !state.scope || !current(state.scope)) throw new Error("受控修订当前不可用");
  if (state.status === "CONFIRMING" || state.status === "REFRESH_PENDING") throw new Error("修订正在确认或等待服务器刷新");
  if (state.draft && typeof window !== "undefined" && !window.confirm("已有未应用的修订草稿。确定丢弃旧草稿吗？")) throw new Error("已保留原修订草稿");
  state.draft = { origin, operations: copy(operations) }; state.dialogOpen = true; state.preview = null; state.confirmBody = null;
  state.revisionId = crypto.randomUUID(); state.humanReason = ""; state.error = ""; state.status = "DRAFT";
}
async function previewDraft(newSession = false) {
  if (!state.draft || !state.scope || !current(state.scope)) return;
  if (newSession) { state.revisionId = crypto.randomUUID(); state.preview = null; state.confirmBody = null; }
  const scope = { ...state.scope }, operations = copy(state.draft.operations), revisionId = state.revisionId;
  state.status = "PREVIEWING"; state.error = "";
  try {
    const result = await post("/stageOrchestrator/revision/preview", { schemaVersion: 1, revisionId,
      projectId: scope.projectId, scriptId: scope.scriptId, revisionKey: "storyboard.semantic.v2", changeSet: { operations } });
    if (!current(scope) || state.revisionId !== revisionId) return;
    state.preview = result; state.status = "PREVIEWED";
  } catch (error: any) {
    if (!current(scope) || state.revisionId !== revisionId) return;
    if (reason(error) === "REVISION_UNSUPPORTED") state.mode = "CONFIG_BLOCKED";
    state.status = reason(error) === "REVISION_PREVIEW_STALE" ? "STALE" : "ERROR";
    state.error = error?.message || "修订预览失败";
  }
}
async function confirm() {
  if (state.status !== "PREVIEWED" || !state.preview || !state.draft || !state.scope || !current(state.scope)) return;
  if (!state.humanReason.trim()) { state.error = "请填写本次修订原因"; return; }
  const scope = { ...state.scope };
  state.confirmBody = copy({ schemaVersion: 1, revisionId: state.revisionId, projectId: scope.projectId,
    scriptId: scope.scriptId, revisionKey: "storyboard.semantic.v2", changeSet: { operations: state.draft.operations },
    previewHash: state.preview.previewHash, expectedRevisionEpoch: state.preview.baseRevisionEpoch,
    humanReason: state.humanReason.trim() });
  const body = state.confirmBody;
  state.status = "CONFIRMING"; state.error = "";
  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const result = await post("/stageOrchestrator/revision/confirm", body);
      if (!current(scope)) return;
      state.applied = result; state.status = "REFRESH_PENDING";
      bindings!.invalidate();
      const next = bindings!.current();
      if (next) state.scope = { ...next };
      await refreshApplied();
      return;
    } catch (error: any) {
      if (!current(scope)) return;
      const code = reason(error);
      if ((code === "REVISION_CONCURRENT_UPDATE" || (!code && !error?.response && typeof error?.code !== "number")) && attempt < 3) continue;
      state.error = error?.message || "修订确认失败";
      state.status = code === "REVISION_PREVIEW_STALE" ? "STALE" : "ERROR";
      if (code === "REVISION_PREVIEW_STALE") await bindings?.refresh().catch(() => {});
      return;
    }
  }
}
async function refreshApplied() {
  if (state.status !== "REFRESH_PENDING" || !state.scope || !bindings) return;
  const scope = { ...state.scope };
  try {
    await bindings.refresh();
    if (!current(scope)) return;
    state.status = "APPLIED"; state.error = "";
    const wasAgentProposal = state.draft?.origin.startsWith("AGENT_");
    state.draft = null; state.dialogOpen = false; state.preview = null; state.confirmBody = null;
    if (wasAgentProposal) state.proposal = null;
  } catch {
    if (current(scope)) state.error = "修订已应用；刷新失败。请只重试读取，不要再次确认。";
  }
}
function receiveProposal(value: Proposal) {
  const scope = state.scope;
  if (state.mode !== "CONTROLLED_V2" || !scope || !current(scope) || value.projectId !== scope.projectId || value.scriptId !== scope.scriptId)
    return { status: "CONTEXT_MISMATCH", applied: false };
  if (!value.proposalId || !["ADD", "REPLACE"].includes(value.kind) || !value.candidate)
    return { status: "INVALID_PROPOSAL", applied: false };
  if (state.proposal?.proposalId === value.proposalId) return JSON.stringify(state.proposal) === JSON.stringify(value)
    ? { status: "PENDING_HUMAN", applied: false, proposalId: value.proposalId }
    : { status: "INVALID_PROPOSAL", applied: false };
  if (state.proposal) return { status: "PROPOSAL_BUSY", applied: false };
  state.proposal = copy(value);
  return { status: "PENDING_HUMAN", applied: false, proposalId: value.proposalId };
}
function discardProposal() { state.proposal = null; }
export function useStoryboardRevision() { return { state, bind, setScope, maySwitch, discard, close, open, previewDraft, confirm,
  refreshApplied, receiveProposal, discardProposal }; }
