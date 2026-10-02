type AssetCandidate = { name: string; [key: string]: unknown };
type MergeSuggestion = { candidateIndex: number; existingCanonicalKey: string; reason: string };

export function prepareAssetExtractionProposal(output: { candidates: AssetCandidate[]; mergeSuggestions: MergeSuggestion[] }, now: number) {
  const merged = new Set(output.mergeSuggestions.map(item => item.candidateIndex));
  return {
    mergeSuggestions: output.mergeSuggestions.map(item => ({
      name: output.candidates[item.candidateIndex].name,
      existingCanonicalKey: item.existingCanonicalKey,
      reason: item.reason,
    })),
    changes: output.candidates.flatMap((asset, index) => merged.has(index) ? [] : [{
      operation: "ADD" as const,
      clientRef: `candidate_${now}_${index}`,
      asset,
    }]),
  };
}
