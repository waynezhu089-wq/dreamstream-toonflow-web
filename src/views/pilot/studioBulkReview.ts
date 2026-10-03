export type BulkReviewSummary = { total: number; applied: number; needsReview: number; failed: number; details: Record<string, string> };
export function preliminaryReview(asset: any, proposal: any) {
  if (!asset || asset.status !== "ACTIVE") return "素材身份不存在";
  if (asset.sourcePolicy === "REAL_REQUIRED" || ["BRAND", "UI"].includes(asset.category)) return "需要真实参考，不能批量确认 AI 草案";
  if (Number(proposal.sourceAssetRevision) !== Number(asset.revision)) return "素材身份已变化，草案过期";
  if (proposal.qualityWarnings?.length) return "有质量警告，需单独审查";
  if (proposal.normalizationWarnings?.length) return "有规范化提醒，需单独审查";
  if (proposal.issues?.length) return "内容待补齐";
  return null;
}

export async function confirmNormalVisuals(input: {
  projectId: number; scriptId: number; keys: string[]; proposals: Record<string, any>;
  read: () => Promise<any>;
  preview: (body: any) => Promise<any>;
  apply: (body: any) => Promise<any>;
  isCurrent: () => boolean;
  onApplied: (key: string) => void;
  onProgress?: (value: BulkReviewSummary) => void;
}): Promise<BulkReviewSummary> {
  const result: BulkReviewSummary = { total: input.keys.length, applied: 0, needsReview: 0, failed: 0, details: {} };
  for (const key of input.keys) {
    if (!input.isCurrent()) break;
    try {
      const state = await input.read();
      if (!input.isCurrent()) break;
      const asset = state.assets.find((row: any) => row.canonicalKey === key);
      const draft = input.proposals[key];
      const reason = draft ? preliminaryReview(asset, draft) : "草案已不存在";
      if (reason) { result.needsReview++; result.details[key] = reason; continue; }
      const body = { projectId: input.projectId, scriptId: input.scriptId, canonicalKey: key, sourceAssetRevision: draft.sourceAssetRevision, spec: draft.spec };
      const preview = await input.preview(body);
      if (!input.isCurrent()) break;
      if (preview.issues?.length) { result.needsReview++; result.details[key] = `内容待补齐：${preview.issues.join("、")}`; continue; }
      await input.apply({ ...body, previewHash: preview.previewHash });
      if (!input.isCurrent()) break;
      input.onApplied(key);
      result.applied++;
    } catch (error: any) {
      if (!input.isCurrent()) break;
      result.failed++;
      result.details[key] = error?.response?.data?.message || error?.message || "确认失败";
    } finally { if (input.isCurrent()) input.onProgress?.({ ...result, details: { ...result.details } }); }
  }
  return result;
}
