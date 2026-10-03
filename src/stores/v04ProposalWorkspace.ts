import { defineStore } from "pinia";
import { reactive, ref, watch } from "vue";
import type { VisualProposalFailure, VisualBatchProgress } from "@/views/pilot/visualProposalBatch";

export type VisualDraft = { canonicalKey: string; sourceAssetRevision: number; spec: any; qualityWarnings?: { path: string; code: string }[]; normalizationWarnings?: { path: string; code: string }[]; [key: string]: any };
type ScopedDrafts = {
  visualSpecProposals: Record<string, VisualDraft>;
  visualSpecFailures: Record<string, VisualProposalFailure>;
  batchSummary: VisualBatchProgress | null;
  batchKeys: string[];
  assetProposal: any | null;
  storyboardDrafts: any[];
  creativeProposal: any | null;
};
const prefix = "v04ProposalWorkspace:v1:";
const empty = (): ScopedDrafts => ({ visualSpecProposals: {}, visualSpecFailures: {}, batchSummary: null, batchKeys: [], assetProposal: null, storyboardDrafts: [], creativeProposal: null });
export const proposalScopeKey = (projectId: number, scriptId: number) => `${projectId}:${scriptId}`;

export const useV04ProposalWorkspace = defineStore("v04ProposalWorkspace", () => {
  const activeKey = ref("");
  const entries = reactive<Record<string, ScopedDrafts>>({});
  const batchRun = ref<VisualBatchProgress | null>(null);
  const current = () => entries[activeKey.value] || (entries[activeKey.value] = empty());
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
        } : empty();
      } catch { entries[key] = empty(); }
    }
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
  function isFresh(canonicalKey: string, revision: number, key = activeKey.value) {
    return Number(entries[key]?.visualSpecProposals[canonicalKey]?.sourceAssetRevision) === Number(revision);
  }
  watch(entries, () => {
    for (const [key, value] of Object.entries(entries)) {
      // Browser session drafts only. These are never authoritative project records.
      sessionStorage.setItem(prefix + key, JSON.stringify(value));
    }
  }, { deep: true });
  return { activeKey, entries, batchRun, current, setScope, putVisual, removeVisual, isFresh };
});
