import type { StudioAssetDraftPackage, VisualDraft } from "@/stores/v04ProposalWorkspace";
import { VISUAL_PROPOSAL_BATCH_SIZE, runVisualProposalBatches, type VisualProposalFailure } from "./visualProposalBatch";

type Asset = { canonicalKey: string; name: string; revision: number; status: string; sourcePolicy: string; category: string; assetKind: string };
type Confirmed = { canonicalKey: string; sourceAssetRevision: number; revision: number; effectiveStatus: string; spec: any };
type Progress = { total: number; completed: number; ready: number; attention: number; failed: number; remaining: number };
type Input = {
  projectId: number; scriptId: number; assets: Asset[]; visualSpecs: Confirmed[];
  proposals: Record<string, VisualDraft>; packages: Record<string, StudioAssetDraftPackage>;
  propose: (keys: string[]) => Promise<{ candidates: VisualDraft[]; failures: VisualProposalFailure[] }>;
  compile: (items: { canonicalKey: string; sourceAssetRevision: number; spec: any }[]) => Promise<{
    candidates: { canonicalKey: string; generationIntent: string; draftPromptIR: any; draftRenderedPrompt: any;
      previewPlan: any; completenessIssues: string[] }[];
    failures: { canonicalKey: string; code: string; message: string }[];
  }>;
  isCurrent: () => boolean;
  onVisual: (draft: VisualDraft) => void;
  onPackage: (draft: StudioAssetDraftPackage) => void;
  onProgress: (progress: Progress) => void;
};

const eligible = (asset: Asset) => asset.status === "ACTIVE" && asset.sourcePolicy === "AI_ALLOWED"
  && !["BRAND", "UI"].includes(asset.category) && !["BRAND_MARK", "UI_REFERENCE"].includes(asset.assetKind);
const usable = (draft: StudioAssetDraftPackage | undefined) => draft?.stage === "WAITING_IMAGE_EXECUTOR" || draft?.stage === "NEEDS_ATTENTION";
const sameSpec = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function freshStudioPackage(asset: Asset, confirmed: Confirmed | undefined, proposal: VisualDraft | undefined,
  existing: StudioAssetDraftPackage | undefined): boolean {
  if (!existing || !usable(existing) || Number(existing.sourceAssetRevision) !== Number(asset.revision)) return false;
  if (confirmed?.effectiveStatus === "CONFIRMED" && Number(confirmed.sourceAssetRevision) === Number(asset.revision))
    return existing.visualSource === "CONFIRMED" && existing.sourceVisualRevision === confirmed.revision && sameSpec(existing.visualSpecDraft, confirmed.spec);
  return existing.visualSource === "PROPOSAL" && !!proposal && Number(proposal.sourceAssetRevision) === Number(asset.revision)
    && sameSpec(existing.visualSpecDraft, proposal.spec);
}

const draftFor = (input: Input, asset: Asset): StudioAssetDraftPackage => ({
  projectId: input.projectId, scriptId: input.scriptId, canonicalKey: asset.canonicalKey,
  sourceAssetRevision: asset.revision, visualSource: "NONE", sourceVisualRevision: null, visualSpecDraft: null,
  diagnostics: { normalizationWarnings: [], qualityWarnings: [], completenessIssues: [] },
  generationIntent: null, draftPromptIR: null, draftRenderedPrompt: null, previewPlan: null,
  stage: "PENDING", error: null,
});

// Session-scoped orchestration only. The sole server calls are the existing
// read-only proposal endpoint and the read-only draft compiler endpoint.
export async function runStudioAssetDraftPipeline(input: Input): Promise<{ aborted: boolean; progress: Progress }> {
  const assets = input.assets.filter(eligible), byKey = new Map(assets.map(asset => [asset.canonicalKey, asset]));
  const confirmed = new Map(input.visualSpecs.filter(spec => spec.effectiveStatus === "CONFIRMED")
    .map(spec => [spec.canonicalKey, spec]));
  const progress: Progress = { total: assets.length, completed: 0, ready: 0, attention: 0, failed: 0, remaining: assets.length };
  const report = () => { if (input.isCurrent()) input.onProgress({ ...progress }); };
  const publish = (value: StudioAssetDraftPackage) => { if (input.isCurrent()) input.onPackage(value); };
  const finish = (value: StudioAssetDraftPackage) => {
    publish(value); progress.completed++;
    if (value.stage === "WAITING_IMAGE_EXECUTOR") progress.ready++;
    else if (value.stage === "NEEDS_ATTENTION") progress.attention++;
    else progress.failed++;
    progress.remaining = progress.total - progress.completed; report();
  };
  report();
  const sources = new Map<string, StudioAssetDraftPackage>();
  const missing: string[] = [];
  for (const asset of assets) {
    const spec = confirmed.get(asset.canonicalKey);
    const proposal = input.proposals[asset.canonicalKey];
    if (freshStudioPackage(asset, spec, proposal, input.packages[asset.canonicalKey])) {
      const old = input.packages[asset.canonicalKey];
      progress.completed++; if (old.stage === "NEEDS_ATTENTION") progress.attention++; else progress.ready++;
      progress.remaining = progress.total - progress.completed; continue;
    }
    const value = draftFor(input, asset);
    if (spec && Number(spec.sourceAssetRevision) === Number(asset.revision)) {
      value.visualSource = "CONFIRMED"; value.sourceVisualRevision = spec.revision;
      value.visualSpecDraft = spec.spec; value.stage = "SPEC_READY";
      sources.set(asset.canonicalKey, value); publish(value);
    } else if (proposal && Number(proposal.sourceAssetRevision) === Number(asset.revision)) {
      value.visualSource = "PROPOSAL"; value.visualSpecDraft = proposal.spec;
      value.diagnostics.normalizationWarnings = proposal.normalizationWarnings ?? [];
      value.diagnostics.qualityWarnings = proposal.qualityWarnings ?? [];
      value.stage = "SPEC_READY"; sources.set(asset.canonicalKey, value); publish(value);
    } else {
      value.stage = "GENERATING_SPEC"; publish(value); missing.push(asset.canonicalKey);
    }
  }
  report();
  if (missing.length) {
    const generated = await runVisualProposalBatches(missing, input.propose, result => {
      if (!input.isCurrent()) return;
      for (const candidate of result.candidates) {
        const asset = byKey.get(candidate.canonicalKey);
        if (!asset || Number(candidate.sourceAssetRevision) !== Number(asset.revision)) continue;
        input.onVisual(candidate);
        const value = draftFor(input, asset);
        value.visualSource = "PROPOSAL"; value.visualSpecDraft = candidate.spec;
        value.diagnostics.normalizationWarnings = candidate.normalizationWarnings ?? [];
        value.diagnostics.qualityWarnings = candidate.qualityWarnings ?? [];
        value.stage = "SPEC_READY"; sources.set(asset.canonicalKey, value); publish(value);
      }
      for (const failure of result.failures) {
        const asset = byKey.get(failure.canonicalKey); if (!asset || sources.has(failure.canonicalKey)) continue;
        const value = draftFor(input, asset); value.stage = "FAILED";
        value.error = { code: failure.code, message: failure.message }; finish(value);
      }
    }, () => {}, input.isCurrent, key => byKey.get(key)?.name ?? key);
    if (generated.aborted || !input.isCurrent()) return { aborted: true, progress };
  }
  const ready = [...sources.values()];
  for (let offset = 0; offset < ready.length; offset += VISUAL_PROPOSAL_BATCH_SIZE) {
    if (!input.isCurrent()) return { aborted: true, progress };
    const batch = ready.slice(offset, offset + VISUAL_PROPOSAL_BATCH_SIZE);
    let result: Awaited<ReturnType<Input["compile"]>>;
    try { result = await input.compile(batch.map(value => ({ canonicalKey: value.canonicalKey,
      sourceAssetRevision: value.sourceAssetRevision, spec: value.visualSpecDraft }))); }
    catch (error: any) {
      result = { candidates: [], failures: batch.map(value => ({ canonicalKey: value.canonicalKey,
        code: error?.code || "PILOT_STUDIO_DRAFT_COMPILE_UNCERTAIN", message: error?.message || "草案编译失败，请重试" })) };
    }
    if (!input.isCurrent()) return { aborted: true, progress };
    const byResult = new Map(result.candidates.map(value => [value.canonicalKey, value]));
    const byFailure = new Map(result.failures.map(value => [value.canonicalKey, value]));
    for (const value of batch) {
      const built = byResult.get(value.canonicalKey);
      if (built) {
        value.generationIntent = built.generationIntent; value.draftPromptIR = built.draftPromptIR;
        value.draftRenderedPrompt = built.draftRenderedPrompt; value.previewPlan = built.previewPlan;
        value.diagnostics.completenessIssues = built.completenessIssues ?? [];
        value.stage = value.diagnostics.qualityWarnings.length || value.diagnostics.normalizationWarnings.length
          || value.diagnostics.completenessIssues.length ? "NEEDS_ATTENTION" : "WAITING_IMAGE_EXECUTOR";
      } else {
        value.stage = "FAILED"; const failure = byFailure.get(value.canonicalKey);
        value.error = { code: failure?.code || "PILOT_STUDIO_DRAFT_RESULT_MISSING", message: failure?.message || "没有返回草案 Prompt" };
      }
      finish(value);
    }
  }
  return { aborted: false, progress };
}
