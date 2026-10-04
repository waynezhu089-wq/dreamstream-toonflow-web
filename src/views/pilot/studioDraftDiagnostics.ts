import type { StudioAssetDraftPackage } from "@/stores/v04ProposalWorkspace";

export type StudioDiagnosticSeverity = "INFO" | "ADVISORY" | "BLOCKING";
type Asset = { canonicalKey: string; name: string; revision: number; status: string; sourcePolicy: string;
  category: string; assetKind: string };
type Reference = { targetKey: string; targetType: string };
type Failure = { canonicalKey: string; name?: string; message?: string };
export type StudioReviewEntry = { key: string; name: string; reason: string };

// This is an explicit extension point, not a rule that every unknown model
// warning blocks the result-first Studio flow. Normalization is always INFO;
// ordinary quality and completeness diagnostics are ADVISORY.
const blockingQualityCodes = new Set([
  "CANONICAL_IDENTITY_CONFLICT", "REAL_REFERENCE_REQUIRED",
  "REFERENCE_CONSTRAINT_VIOLATION", "UNSAFE_GENERATION_CONSTRAINT",
]);
const blockingReasons: Record<string, string> = {
  CANONICAL_IDENTITY_CONFLICT: "素材身份与现有设定冲突",
  REAL_REFERENCE_REQUIRED: "缺少必需的真实参考",
  REFERENCE_CONSTRAINT_VIOLATION: "真实参考约束不满足",
  UNSAFE_GENERATION_CONSTRAINT: "图片生成约束需要处理",
};
export const qualitySeverity = (warning: { code?: string }): StudioDiagnosticSeverity =>
  blockingQualityCodes.has(warning.code ?? "") ? "BLOCKING" : "ADVISORY";

export function studioDraftDiagnostics(draft: StudioAssetDraftPackage) {
  const diagnostics = draft.diagnostics ?? { normalizationWarnings: [], qualityWarnings: [], completenessIssues: [] };
  return {
    info: diagnostics.normalizationWarnings ?? [],
    advisory: [...(diagnostics.qualityWarnings ?? []).filter(warning => qualitySeverity(warning) === "ADVISORY"),
      ...(diagnostics.completenessIssues ?? [])],
    blocking: (diagnostics.qualityWarnings ?? []).filter(warning => qualitySeverity(warning) === "BLOCKING"),
  };
}

export function classifyStudioDraftPackage(draft: StudioAssetDraftPackage, asset?: Pick<Asset, "revision">): {
  stage: StudioAssetDraftPackage["stage"]; reason: string | null } {
  if (asset && Number(draft.sourceAssetRevision) !== Number(asset.revision))
    return { stage: "STALE", reason: "素材身份发生变化，需要重新设计" };
  if (draft.stage === "STALE") return { stage: "STALE", reason: "草案来源已过期，需要重新设计" };
  if (draft.error || draft.stage === "FAILED")
    return { stage: "FAILED", reason: draft.error?.message || "视觉草案生成失败" };
  if (!["WAITING_IMAGE_EXECUTOR", "NEEDS_ATTENTION", "PROMPT_READY"].includes(draft.stage))
    return { stage: draft.stage, reason: null };
  if (!draft.visualSpecDraft) return { stage: "FAILED", reason: "缺少有效视觉草案" };
  if (typeof draft.generationIntent !== "string" || !draft.generationIntent.trim())
    return { stage: "FAILED", reason: "无法确定图片生成意图" };
  if (!draft.draftPromptIR || typeof draft.draftPromptIR !== "object" || !Object.keys(draft.draftPromptIR).length)
    return { stage: "FAILED", reason: "Prompt 草案编译失败" };
  if (!draft.draftRenderedPrompt || typeof draft.draftRenderedPrompt.text !== "string"
      || !draft.draftRenderedPrompt.text.trim())
    return { stage: "FAILED", reason: "Prompt 草案缺少可用内容" };
  const blocking = studioDraftDiagnostics(draft).blocking[0];
  if (blocking) return { stage: "NEEDS_ATTENTION",
    reason: blockingReasons[blocking.code] || "关键视觉约束需要处理" };
  return { stage: "WAITING_IMAGE_EXECUTOR", reason: null };
}

export function reclassifyStoredStudioDrafts(packages: Record<string, StudioAssetDraftPackage>) {
  for (const draft of Object.values(packages)) {
    if (!draft || typeof draft !== "object" || draft.stage !== "NEEDS_ATTENTION") continue;
    // Preserve every source revision, compiled output and diagnostic. The
    // current asset revision is checked again when project truth is loaded.
    draft.stage = classifyStudioDraftPackage(draft).stage;
  }
  return packages;
}

export function studioDraftReviewEntries(assets: Asset[], packages: Record<string, StudioAssetDraftPackage>,
  references: Reference[], failures: Failure[] = []): StudioReviewEntry[] {
  const entries: StudioReviewEntry[] = [];
  for (const asset of assets.filter(asset => asset.status === "ACTIVE")) {
    const real = asset.sourcePolicy === "REAL_REQUIRED" || ["BRAND", "UI"].includes(asset.category)
      || ["BRAND_MARK", "UI_REFERENCE"].includes(asset.assetKind);
    if (real) {
      if (!references.some(ref => ref.targetKey === asset.canonicalKey && ["ASSET_BIBLE", "BIND_SELECTED_ASSET"].includes(ref.targetType)))
        entries.push({ key: asset.canonicalKey, name: asset.name, reason: "缺少已确认的真实参考" });
      continue;
    }
    const draft = packages[asset.canonicalKey];
    if (draft) {
      const result = classifyStudioDraftPackage(draft, asset);
      if (["STALE", "FAILED", "NEEDS_ATTENTION"].includes(result.stage))
        entries.push({ key: asset.canonicalKey, name: asset.name, reason: result.reason || "视觉草案需要处理" });
      continue;
    }
    const failure = failures.find(item => item.canonicalKey === asset.canonicalKey);
    if (failure) entries.push({ key: asset.canonicalKey, name: asset.name, reason: failure.message || "视觉草案生成失败" });
  }
  return entries;
}

export function summarizeStudioDrafts(assets: Asset[], packages: Record<string, StudioAssetDraftPackage>) {
  const result = { processed: 0, waiting: 0, attention: 0, failed: 0 };
  for (const asset of assets.filter(asset => asset.status === "ACTIVE" && asset.sourcePolicy === "AI_ALLOWED"
    && !["BRAND", "UI"].includes(asset.category) && !["BRAND_MARK", "UI_REFERENCE"].includes(asset.assetKind))) {
    const draft = packages[asset.canonicalKey];
    if (!draft) continue;
    const { stage } = classifyStudioDraftPackage(draft, asset);
    if (!["WAITING_IMAGE_EXECUTOR", "NEEDS_ATTENTION", "FAILED", "STALE"].includes(stage)) continue;
    result.processed++;
    if (stage === "WAITING_IMAGE_EXECUTOR") result.waiting++;
    else if (stage === "FAILED") result.failed++;
    else result.attention++;
  }
  return result;
}
