type AssetCandidate = { name: string; relatedExistingKeys?: string[]; relatedCandidateIndexes?: number[]; sharedVisualSystemKey?: string | null; sharedVisualSystemCandidateIndex?: number | null; extractionPass?: string; [key: string]: unknown };
type MergeSuggestion = { candidateIndex: number; existingCanonicalKey: string; reason: string };
type CoverageItem = { label: string; coverageType: string; classification: string; candidateIndexes: number[]; existingCanonicalKeys: string[]; note: string };
type RequirementLink = { requirementKey: string; sourceCoverageIndex: number | null };

export function prepareAssetExtractionProposal(output: { candidates: AssetCandidate[]; mergeSuggestions: MergeSuggestion[]; coverage?: CoverageItem[] }, now: number, requirements: RequirementLink[] = []) {
  const merged = new Map(output.mergeSuggestions.map(item => [item.candidateIndex, item.existingCanonicalKey]));
  const keyBySourceIndex = new Map(requirements.filter(item => item.sourceCoverageIndex !== null).map(item => [item.sourceCoverageIndex, item.requirementKey]));
  const ref = (index: number) => `candidate_${now}_${index}`;
  return {
    mergeSuggestions: output.mergeSuggestions.map(item => ({
      name: output.candidates[item.candidateIndex].name,
      existingCanonicalKey: item.existingCanonicalKey,
      reason: item.reason,
    })),
    changes: output.candidates.flatMap((asset, index) => merged.has(index) ? [] : [{
      operation: "ADD" as const,
      clientRef: ref(index),
      asset: (() => {
        const { relatedExistingKeys, relatedCandidateIndexes, sharedVisualSystemCandidateIndex, extractionPass, ...fields } = asset;
        return {
          ...fields,
          ...(relatedExistingKeys || relatedCandidateIndexes ? { relatedKeys: [...new Set([...(relatedExistingKeys ?? []), ...(relatedCandidateIndexes ?? []).flatMap(i => merged.has(i) ? [merged.get(i)!] : [])])] } : {}),
          ...(sharedVisualSystemCandidateIndex != null && merged.has(sharedVisualSystemCandidateIndex) ? { sharedVisualSystemKey: merged.get(sharedVisualSystemCandidateIndex)! } : {}),
        };
      })(),
      ...(asset.relatedCandidateIndexes?.some(i => !merged.has(i)) ? { relatedClientRefs: asset.relatedCandidateIndexes.filter(i => !merged.has(i)).map(ref) } : {}),
      ...(asset.sharedVisualSystemCandidateIndex != null && !merged.has(asset.sharedVisualSystemCandidateIndex) ? { sharedVisualSystemClientRef: ref(asset.sharedVisualSystemCandidateIndex) } : {}),
    }]),
    coverage: output.coverage?.map((item, index) => ({
      label: item.label, coverageType: item.coverageType, classification: item.classification, note: item.note,
      candidateRefs: item.candidateIndexes.filter(i => !merged.has(i)).map(ref),
      existingCanonicalKeys: [...new Set([...item.existingCanonicalKeys, ...item.candidateIndexes.flatMap(i => merged.has(i) ? [merged.get(i)!] : [])])],
      ...(keyBySourceIndex.has(index) ? { reviewRequirementKey: keyBySourceIndex.get(index)! } : {}),
    })) ?? [],
  };
}

type PendingChange = { operation: string; clientRef?: string; asset?: { name: string; relatedKeys?: string[]; sharedVisualSystemKey?: string | null }; relatedClientRefs?: string[]; sharedVisualSystemClientRef?: string | null };
type ExistingAsset = { canonicalKey: string; name: string };
const distinct = (names: string[]) => [...new Set(names.filter(Boolean))];

export function describeProposalRelations(change: PendingChange, changes: PendingChange[], existing: ExistingAsset[]) {
  const byRef = new Map(changes.filter(item => item.operation === "ADD").map(item => [item.clientRef, item.asset?.name]));
  const byKey = new Map(existing.map(item => [item.canonicalKey, item.name]));
  const display = (key: string) => byRef.get(key) || byKey.get(key) || (key.startsWith("candidate_") ? "未知候选" : key);
  const sharedKey = change.sharedVisualSystemClientRef || change.asset?.sharedVisualSystemKey;
  const shared = sharedKey ? display(sharedKey) : "";
  const continuity = distinct([...(change.relatedClientRefs || []), ...(change.asset?.relatedKeys || [])]
    .filter(key => key !== sharedKey).map(display)).filter(name => name !== change.asset?.name && name !== shared);
  return { shared, continuity };
}

type ReviewRequirement = { requirementKey: string; label: string; coverageType: string; classification: string; status: string; suggestedAsset?: unknown; note: string };
type Review = { status: string; reason: string; auditComplete?: boolean; requirements: ReviewRequirement[] };
type PendingCoverage = { reviewRequirementKey?: string; label?: string; candidateRefs: string[]; existingCanonicalKeys: string[]; classification: string };

export function reviewPendingSufficiency(base: Review | null, coverage: PendingCoverage[]) {
  if (!base) return null;
  const byRequirementKey = new Map(coverage.filter(row => row.reviewRequirementKey).map(row => [row.reviewRequirementKey, row]));
  const requirements = base.requirements.map(item => {
    const row = byRequirementKey.get(item.requirementKey);
    const documented = row && ["SHOT_LOCAL", "COMPOSITION_MOTIF"].includes(row.classification);
    const status = documented ? "DOCUMENTED" : row?.candidateRefs?.length || row?.existingCanonicalKeys?.length ? "COVERED" : "MISSING";
    return { ...item, label: row?.label || item.label, status };
  });
  const missing = requirements.filter(item => item.status === "MISSING");
  const ready = !!base.auditComplete && !!base.requirements.length && !missing.length;
  return { ...base, requirements,
    status: ready ? "READY" : "NEEDS_REVIEW",
    reason: missing.length ? `${missing.length} 项重要视觉内容仍待人工确定生产归属` : ready ? "已列重要视觉内容均有明确归属；请人工确认" : base.reason };
}

export function appendCandidateForRequirement(changes: PendingChange[], coverage: any[], requirement: any | null, clientRef: string) {
  const byCoverage: Record<string, [string, string]> = {
    PERSON: ["CHAR", "HUMAN_CHARACTER"], CREATURE: ["CHAR", "CREATURE"],
    VEHICLE: ["PROP", "VEHICLE"], SCENE: ["LOC", "ENVIRONMENT"],
    FX_MATERIAL: ["FX", "MATERIAL_FX"], BRAND: ["BRAND", "BRAND_MARK"], PROP: ["PROP", "PROP"],
  };
  const [category, assetKind] = byCoverage[requirement?.coverageType] || ["PROP", "PROP"];
  const asset = {
    name: requirement?.suggestedAsset?.name || requirement?.label || "新素材候选",
    category: requirement?.suggestedAsset?.category || category,
    assetKind: requirement?.suggestedAsset?.assetKind || assetKind,
    importance: requirement?.suggestedAsset?.importance || "SUPPORTING",
    description: "", sourcePolicy: ["BRAND", "UI"].includes(requirement?.suggestedAsset?.category || category) ? "REAL_REQUIRED" : "AI_ALLOWED",
    prompt: "", identityAnchors: [], mustPreserve: [], forbiddenChanges: [],
    ownerKey: null, variantOf: null, relatedKeys: [], sharedVisualSystemKey: null,
  };
  const nextCoverage = coverage.map(item => ({ ...item, candidateRefs: [...item.candidateRefs] }));
  const target = requirement && nextCoverage.find(item => item.reviewRequirementKey === requirement.requirementKey);
  if (target) target.candidateRefs.push(clientRef);
  else nextCoverage.push({ ...(requirement ? { reviewRequirementKey: requirement.requirementKey } : {}),
    label: requirement?.label || "新素材候选", coverageType: requirement?.coverageType || "PROP",
    classification: "CANONICAL_ASSET", candidateRefs: [clientRef], existingCanonicalKeys: [],
    note: requirement?.note || "人工补充，预览前请核对 Treatment 依据" });
  return { changes: [...changes, { operation: "ADD", clientRef, asset }], coverage: nextCoverage };
}

export function assetCoveragePayload(coverage: (PendingCoverage & Record<string, unknown>)[]) {
  return coverage.map(({ reviewRequirementKey: _reviewRequirementKey, ...row }) => row);
}
