export type StudioAssetCreateAction = { targetType: "ASSET_CREATE"; sourceCreativeVersion: number;
  proposal: { operation: "ADD"; clientRef: string; asset: Record<string, unknown> } };
export type StudioAssetCreateReview = { action: StudioAssetCreateAction; body: {
  projectId: number; scriptId: number; sourceCreativeVersion: number; changes: StudioAssetCreateAction["proposal"][] };
  preview: { previewHash: string; suggestions?: { possibleMatches?: string[] }[] } };
export type StudioAssetCreateCardState = StudioAssetCreateReview & {
  actionId: string; projectId: number; scriptId: number; generation: number;
  status: "PREVIEWED" | "APPLYING" | "UNCERTAIN" | "PREPARING" | "READY" | "PREPARE_FAILED";
  canonicalKey: string | null; error: string; prepareError: string | null;
};

export async function previewStudioAssetCreate(action: StudioAssetCreateAction, scope: { projectId: number; scriptId: number },
  post: (path: string, body: object) => Promise<any>, isCurrent: () => boolean): Promise<StudioAssetCreateReview> {
  if (action.targetType !== "ASSET_CREATE" || action.proposal.operation !== "ADD") throw new Error("新增素材提案无效");
  const body = { ...scope, sourceCreativeVersion: action.sourceCreativeVersion, changes: [action.proposal] };
  const preview = await post("/assets/preview", body);
  if (!isCurrent()) throw new Error("当前制作单元已切换，旧提案没有应用");
  if (!preview?.previewHash) throw new Error("新增素材预览缺少校验结果");
  return { action, body, preview };
}

// The server is the identity authority. Only its successful Apply response
// supplies the new canonical key; a failed/ambiguous Apply is never retried
// automatically. Refresh and draft preparation happen only in the old scope.
export async function applyStudioAssetCreate(review: StudioAssetCreateReview,
  post: (path: string, body: object) => Promise<any>, refresh: () => Promise<unknown>,
  enqueue: (canonicalKey: string) => Promise<unknown>, isCurrent: () => boolean): Promise<{
    applied: true; canonicalKey: string; current: boolean; prepareError: string | null }> {
  const response = await post("/assets/apply", { ...review.body, previewHash: review.preview.previewHash });
  const canonicalKey = response?.applied?.find((item: any) => item.clientRef === review.action.proposal.clientRef)?.canonicalKey;
  if (typeof canonicalKey !== "string" || !canonicalKey) throw new Error("服务器未返回新增素材的 canonicalKey；请刷新项目核查，勿重复新增");
  if (!isCurrent()) return { applied: true, canonicalKey, current: false, prepareError: null };
  try {
    await refresh();
    if (!isCurrent()) return { applied: true, canonicalKey, current: false, prepareError: null };
    await enqueue(canonicalKey);
    return { applied: true, canonicalKey, current: isCurrent(), prepareError: null };
  } catch (error: any) {
    return { applied: true, canonicalKey, current: isCurrent(), prepareError: error?.message || "自动准备失败" };
  }
}
