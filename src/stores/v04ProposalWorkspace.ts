import { defineStore } from "pinia";
import { reactive, ref, watch } from "vue";
import type { VisualProposalFailure, VisualBatchProgress } from "@/views/pilot/visualProposalBatch";
import { reclassifyStoredStudioDrafts } from "@/views/pilot/studioDraftDiagnostics";

export type VisualDraft = { canonicalKey: string; sourceAssetRevision: number; spec: any; qualityWarnings?: { path: string; code: string }[]; normalizationWarnings?: { path: string; code: string }[]; [key: string]: any };
export type StudioAssetDraftPackage = {
  projectId: number; scriptId: number; canonicalKey: string; sourceAssetRevision: number;
  visualSource: "CONFIRMED" | "PROPOSAL" | "NONE"; sourceVisualRevision: number | null;
  visualSpecDraft: any | null;
  diagnostics: { normalizationWarnings: any[]; qualityWarnings: any[]; completenessIssues: string[] };
  generationIntent: string | null; draftPromptIR: any | null; draftRenderedPrompt: any | null;
  previewPlan: any | null;
  stage: "PENDING" | "GENERATING_SPEC" | "SPEC_READY" | "PROMPT_READY" | "WAITING_IMAGE_EXECUTOR" | "NEEDS_ATTENTION" | "FAILED" | "STALE";
  error: { code: string; message: string } | null;
};
type ScopedDrafts = {
  visualSpecProposals: Record<string, VisualDraft>;
  visualSpecFailures: Record<string, VisualProposalFailure>;
  batchSummary: VisualBatchProgress | null;
  batchKeys: string[];
  assetProposal: any | null;
  storyboardDrafts: any[];
  creativeProposal: any | null;
  studioActions: Record<string, { action: any; handled: boolean }>;
  studioAssetDraftPackages: Record<string, StudioAssetDraftPackage>;
};
const prefix = "v04ProposalWorkspace:v1:";
const empty = (): ScopedDrafts => ({ visualSpecProposals: {}, visualSpecFailures: {}, batchSummary: null, batchKeys: [], assetProposal: null, storyboardDrafts: [], creativeProposal: null, studioActions: {}, studioAssetDraftPackages: {} });
export const proposalScopeKey = (projectId: number, scriptId: number) => `${projectId}:${scriptId}`;

export const useV04ProposalWorkspace = defineStore("v04ProposalWorkspace", () => {
  const activeKey = ref("");
  const entries = reactive<Record<string, ScopedDrafts>>({});
  const batchRun = ref<VisualBatchProgress | null>(null);
  const current = () => {
    const entry = entries[activeKey.value] || (entries[activeKey.value] = empty());
    // A live Pilot tab can retain a pre-Studio draft object during Vite HMR.
    entry.studioActions ||= {};
    entry.studioAssetDraftPackages ||= {};
    reclassifyStoredStudioDrafts(entry.studioAssetDraftPackages);
    return entry;
  };
  function setScope(projectId: number, scriptId: number) {
    const key = proposalScopeKey(projectId, scriptId);
    if (key !== activeKey.value) batchRun.value = null;
    activeKey.value = key;
    if (!entries[key]) {
      try {
        const parsed = JSON.parse(sessionStorage.getItem(prefix + key) || "null");
        entries[key] = parsed && typeof parsed === "object" ? {
          visualSpecProposals: parsed.visualSpecProposals || {},
          visualSpecFailures: parsed.visualSpecFailures || {},
          batchSummary: parsed.batchSummary || null,
          batchKeys: parsed.batchKeys || [],
          assetProposal: parsed.assetProposal || null,
          storyboardDrafts: parsed.storyboardDrafts || [],
          creativeProposal: parsed.creativeProposal || null,
          studioActions: parsed.studioActions || {},
          studioAssetDraftPackages: reclassifyStoredStudioDrafts(parsed.studioAssetDraftPackages || {}),
        } : empty();
      } catch { entries[key] = empty(); }
    }
    reclassifyStoredStudioDrafts(entries[key].studioAssetDraftPackages);
    return key;
  }
  function putVisual(proposal: VisualDraft, key = activeKey.value) {
    if (!entries[key]) entries[key] = empty();
    entries[key].visualSpecProposals[proposal.canonicalKey] = proposal;
    delete entries[key].visualSpecFailures[proposal.canonicalKey];
  }
  function removeVisual(canonicalKey: string, key = activeKey.value) {
    if (entries[key]) delete entries[key].visualSpecProposals[canonicalKey];
  }
  function putStudioAction(messageId: string, action: any, key = activeKey.value) {
    if (!entries[key]) entries[key] = empty();
    entries[key].studioActions ||= {};
    entries[key].studioActions[messageId] = { action, handled: false };
  }
  function putStudioDraft(value: StudioAssetDraftPackage, key = activeKey.value) {
    if (!entries[key]) entries[key] = empty();
    entries[key].studioAssetDraftPackages ||= {};
    entries[key].studioAssetDraftPackages[value.canonicalKey] = value;
  }
  function isFresh(canonicalKey: string, revision: number, key = activeKey.value) {
    return Number(entries[key]?.visualSpecProposals[canonicalKey]?.sourceAssetRevision) === Number(revision);
  }
  watch(entries, () => {
    for (const [key, value] of Object.entries(entries)) {
      // Browser session drafts only. These are never authoritative project records.
      sessionStorage.setItem(prefix + key, JSON.stringify(value));
    }
  }, { deep: true });
  return { activeKey, entries, batchRun, current, setScope, putVisual, removeVisual, putStudioAction, putStudioDraft, isFresh };
});
