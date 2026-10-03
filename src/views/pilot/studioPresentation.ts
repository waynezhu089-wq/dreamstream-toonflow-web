export type StudioGroup = "主体" | "场景" | "视觉系统" | "品牌";
export type StudioAssetStatus = "待设计" | "草案待审" | "需要处理" | "视觉规格已确认" | "Prompt 已准备" | "预览待生成" | "预览已生成" | "正式采用" | "真实参考专用";
export const isRealReference = (asset: any) => asset.sourcePolicy === "REAL_REQUIRED" || ["BRAND", "UI", "BRAND_MARK", "UI_REFERENCE"].includes(asset.category) || ["BRAND_MARK", "UI_REFERENCE"].includes(asset.assetKind);
export function studioGroup(asset: any): StudioGroup {
  if (isRealReference(asset)) return "品牌";
  if (asset.assetKind === "MATERIAL_FX" || asset.category === "FX") return "视觉系统";
  if (["ENVIRONMENT", "CELESTIAL"].includes(asset.assetKind) || asset.category === "LOC") return "场景";
  return "主体";
}
export function studioKind(asset: any): string {
  return ({ HUMAN_CHARACTER: "人物设定", CREATURE: "生物设定", VEHICLE: "载具设定", PROP: "道具设定", ENVIRONMENT: "场景建立图",
    CELESTIAL: "天体与构图", MATERIAL_FX: "材质状态板", BRAND_MARK: "真实品牌参考", UI_REFERENCE: "真实界面参考" } as Record<string, string>)[asset.assetKind] || "素材设定";
}
export function studioAssetStatus(asset: any, visualSpec: any, promptBuild: any, reviewPlan: any, refs: any[], draft?: any): StudioAssetStatus {
  if (isRealReference(asset)) return refs.length ? "正式采用" : "真实参考专用";
  if (draft && Number(draft.sourceAssetRevision) !== Number(asset.revision)) return "需要处理";
  if (draft?.qualityWarnings?.length || draft?.normalizationWarnings?.length) return "需要处理";
  if (draft) return "草案待审";
  if (visualSpec?.effectiveStatus === "STALE") return "需要处理";
  if (!visualSpec) return "待设计";
  if (reviewPlan?.previewFilePath || reviewPlan?.turnaroundFilePaths?.some(Boolean)) return "预览已生成";
  if (reviewPlan?.previewStatus === "PLANNED" || reviewPlan?.turnaroundStatus === "PLANNED") return "预览待生成";
  if (promptBuild?.effectiveStatus === "READY") return "Prompt 已准备";
  return "视觉规格已确认";
}
export function safeStudioImagePath(path: unknown): string | null {
  if (typeof path !== "string") return null;
  // Only already-exposed OSS paths. Local file paths never reach the browser.
  if (!/^\/oss\/[A-Za-z0-9_./-]+$/.test(path) || path.includes("..")) return null;
  return path;
}
export function studioAssets(state: any, proposals: Record<string, any>) {
  const visual = new Map((state?.visualSpecs || []).map((row: any) => [row.canonicalKey, row]));
  const prompts = new Map((state?.promptBuilds || []).map((row: any) => [row.canonicalKey, row]));
  const reviews = new Map((state?.reviewPlans || []).map((row: any) => [row.canonicalKey, row]));
  return (state?.assets || []).filter((asset: any) => asset.status === "ACTIVE").map((asset: any) => {
    const refs = (state?.agentReferences || []).filter((row: any) => row.targetKey === asset.canonicalKey && ["ASSET_BIBLE", "BIND_SELECTED_ASSET"].includes(row.targetType));
    const review: any = reviews.get(asset.canonicalKey);
    const outputPath = safeStudioImagePath(review?.previewFilePath) || (review?.turnaroundFilePaths || []).map(safeStudioImagePath).find(Boolean) || null;
    return { asset, group: studioGroup(asset), kind: studioKind(asset), status: studioAssetStatus(asset, visual.get(asset.canonicalKey), prompts.get(asset.canonicalKey), review, refs, proposals[asset.canonicalKey]),
      review, refs, outputPath, placeholder: isRealReference(asset) ? "等待真实参考" : review?.turnaroundStatus === "PLANNED" ? "三视图已规划" : review?.previewStatus === "PLANNED" ? "等待低清预览" : studioKind(asset) + "待生成" };
  });
}
