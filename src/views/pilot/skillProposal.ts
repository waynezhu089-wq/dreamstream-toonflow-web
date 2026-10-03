type AssetCandidate = { name: string; relatedExistingKeys?: string[]; relatedCandidateIndexes?: number[]; sharedVisualSystemKey?: string | null; sharedVisualSystemCandidateIndex?: number | null; extractionPass?: string; [key: string]: unknown };
type MergeSuggestion = { candidateIndex: number; existingCanonicalKey: string; reason: string };
type CoverageItem = { label: string; coverageType: string; classification: string; candidateIndexes: number[]; existingCanonicalKeys: string[]; note: string };

export function prepareAssetExtractionProposal(output: { candidates: AssetCandidate[]; mergeSuggestions: MergeSuggestion[]; coverage?: CoverageItem[] }, now: number) {
  const merged = new Map(output.mergeSuggestions.map(item => [item.candidateIndex, item.existingCanonicalKey]));
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
    coverage: output.coverage?.map(item => ({
      label: item.label, coverageType: item.coverageType, classification: item.classification, note: item.note,
      candidateRefs: item.candidateIndexes.filter(i => !merged.has(i)).map(ref),
      existingCanonicalKeys: [...new Set([...item.existingCanonicalKeys, ...item.candidateIndexes.flatMap(i => merged.has(i) ? [merged.get(i)!] : [])])],
    })) ?? [],
  };
}
