export interface StoryboardProduction {
  productionMode?: "REAL_ASSET_DIRECT" | "AI_TEXT_TO_IMAGE" | "AI_REFERENCE_GENERATE" | "REAL_AI_COMPOSITE" | null;
  primaryAssetId?: number | null;
  referenceAssetIds?: number[];
  referenceAssetGroupIds?: string[];
  promptSkillId?: string | null;
  promptSkillVersion?: string | null;
  capabilityId?: string | null;
}
// Transport only. Never infer a primary asset from association order or a mode
// from shouldGenerateImage. Missing legacy fields remain absent.
export function storyboardProductionFields(value: StoryboardProduction): StoryboardProduction {
  const result: Record<string, unknown> = {};
  for (const key of ["productionMode", "primaryAssetId", "referenceAssetIds", "referenceAssetGroupIds", "promptSkillId", "promptSkillVersion", "capabilityId"] as const) {
    if (Object.hasOwn(value, key)) result[key] = Array.isArray(value[key]) ? [...value[key]] : value[key];
  }
  return result;
}
