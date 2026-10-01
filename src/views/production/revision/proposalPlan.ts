import type { RevisionOperation } from "./coordinator";

const modes = new Set(["REAL_ASSET_DIRECT", "AI_TEXT_TO_IMAGE", "AI_REFERENCE_GENERATE", "REAL_AI_COMPOSITE"]);
const ids = (value: unknown): number[] => {
  if (!Array.isArray(value) || value.some(item => !Number.isSafeInteger(item) || item <= 0) ||
    new Set(value).size !== value.length) throw new Error("素材 ID 必须是未重复的有效整数");
  return value;
};
export function semanticCandidate(item: any) {
  if (!item || !Number.isFinite(item.duration) || item.duration <= 0 || !modes.has(item.productionMode) ||
    typeof item.track !== "string" || !["string", "object"].includes(typeof item.prompt) ||
    !(typeof item.videoDesc === "string" || item.videoDesc === null))
    throw new Error("Agent 提案缺少合法的时长、生产方式或语义字段");
  if (item.prompt !== null && typeof item.prompt !== "string") throw new Error("分镜提示词格式无效");
  if (item.primaryAssetId !== null && item.primaryAssetId !== undefined &&
    (!Number.isSafeInteger(item.primaryAssetId) || item.primaryAssetId <= 0)) throw new Error("主素材 ID 无效");
  const groups = item.referenceAssetGroupIds ?? [];
  if (!Array.isArray(groups) || groups.length) throw new Error("当前不支持 Asset Group 引用，不能静默丢弃");
  const linkedAssetIds = ids(item.associateAssetsIds ?? item.linkedAssetIds ?? []);
  const referenceAssetIds = ids(item.referenceAssetIds ?? []);
  const primaryAssetId = item.primaryAssetId ?? null;
  if (primaryAssetId && !linkedAssetIds.includes(primaryAssetId)) throw new Error("主素材须明确关联当前素材");
  if (item.productionMode === "REAL_ASSET_DIRECT" && !primaryAssetId) throw new Error("真实素材直用必须指定主素材");
  return { track: item.track, duration: item.duration, prompt: item.prompt, videoDesc: item.videoDesc,
    productionMode: item.productionMode, primaryAssetId, referenceAssetIds, referenceAssetGroupIds: [], linkedAssetIds };
}
export function proposalOperations(kind: "ADD" | "REPLACE", candidate: any, currentIds: number[]): RevisionOperation[] {
  if (kind === "ADD") return [{ type: "ADD", clientRef: "agentAdd", storyboard: semanticCandidate(candidate) }];
  if (!Array.isArray(candidate) || !candidate.length || candidate.length > 50) throw new Error("整套替换提案镜头数量无效");
  const adds = candidate.map((item, index) => ({ type: "ADD" as const, clientRef: `agentShot${index + 1}`, storyboard: semanticCandidate(item) }));
  return [
    ...currentIds.map(storyboardId => ({ type: "RETIRE" as const, storyboardId })),
    ...adds,
    { type: "REORDER", order: adds.map(item => ({ clientRef: item.clientRef })) },
  ];
}
export function semanticBaseline(rows: any[]) {
  return JSON.stringify(rows.map(row => ({ id: row.id, index: row.index, track: row.track, duration: row.duration,
    prompt: row.prompt, videoDesc: row.videoDesc, productionMode: row.productionMode,
    primaryAssetId: row.primaryAssetId, associateAssetsIds: row.associateAssetsIds,
    referenceAssetIds: row.referenceAssetIds, referenceAssetGroupIds: row.referenceAssetGroupIds })));
}
