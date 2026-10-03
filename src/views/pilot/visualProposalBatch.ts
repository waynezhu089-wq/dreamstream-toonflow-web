export type VisualProposalFailure = { canonicalKey: string; name: string; code: string; message: string };
export type VisualProposalCandidate = { canonicalKey: string; spec: unknown; qualityWarnings?: { path: string; code: string }[]; normalizationWarnings?: { path: string; code: string }[] };
export type VisualProposalResult = { candidates: VisualProposalCandidate[]; failures: VisualProposalFailure[] };

export function mergeVisualProposalResults<T extends VisualProposalCandidate>(
  current: Record<string, T>, pendingFailures: Record<string, VisualProposalFailure>, result: { candidates: T[]; failures: VisualProposalFailure[] },
) {
  const proposals = { ...current }, failures = { ...pendingFailures };
  for (const candidate of result.candidates) { proposals[candidate.canonicalKey] = candidate; delete failures[candidate.canonicalKey]; }
  for (const failure of result.failures) failures[failure.canonicalKey] = failure;
  return { proposals, failures, successfulCount: result.candidates.length, failedCount: result.failures.length };
}
