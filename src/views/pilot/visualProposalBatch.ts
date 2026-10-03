export type VisualProposalFailure = { canonicalKey: string; name: string; code: string; message: string };
export type VisualProposalCandidate = { canonicalKey: string; spec: unknown; qualityWarnings?: { path: string; code: string }[]; normalizationWarnings?: { path: string; code: string }[] };
export type VisualProposalResult = { candidates: VisualProposalCandidate[]; failures: VisualProposalFailure[] };
export const VISUAL_PROPOSAL_BATCH_SIZE = 6;
export type VisualBatchProgress = { total: number; completed: number; succeeded: number; failed: number; remaining: number };

export function pendingVisualProposalKeys(
  assets: { canonicalKey: string; status: string; sourcePolicy: string; category: string }[],
  specs: { canonicalKey: string; effectiveStatus: string }[],
): string[] {
  const confirmed = new Set(specs.filter(spec => spec.effectiveStatus === 'CONFIRMED').map(spec => spec.canonicalKey));
  return [...new Set(assets.filter(asset => asset.status === 'ACTIVE' && asset.sourcePolicy === 'AI_ALLOWED'
    && !['BRAND', 'UI'].includes(asset.category) && !confirmed.has(asset.canonicalKey))
    .map(asset => asset.canonicalKey).filter(Boolean))];
}

// One request at a time. A changed unit stops future requests and drops the late response.
export async function runVisualProposalBatches<T extends VisualProposalCandidate>(
  keys: string[],
  request: (batch: string[]) => Promise<{ candidates: T[]; failures: VisualProposalFailure[] }>,
  onBatch: (result: { candidates: T[]; failures: VisualProposalFailure[] }) => void,
  onProgress: (progress: VisualBatchProgress) => void,
  isCurrent: () => boolean,
  nameFor: (key: string) => string,
): Promise<{ aborted: boolean; progress: VisualBatchProgress }> {
  const progress: VisualBatchProgress = { total: keys.length, completed: 0, succeeded: 0, failed: 0, remaining: keys.length };
  if (isCurrent()) onProgress({ ...progress });
  for (let offset = 0; offset < keys.length; offset += VISUAL_PROPOSAL_BATCH_SIZE) {
    if (!isCurrent()) return { aborted: true, progress };
    const batch = keys.slice(offset, offset + VISUAL_PROPOSAL_BATCH_SIZE);
    let response: { candidates: T[]; failures: VisualProposalFailure[] };
    try { response = await request(batch); }
    catch {
      response = { candidates: [], failures: batch.map(canonicalKey => ({ canonicalKey, name: nameFor(canonicalKey),
        code: 'PILOT_VISUAL_BATCH_UNCERTAIN', message: '本批结果未确认，请仅重试失败项' })) };
    }
    if (!isCurrent()) return { aborted: true, progress };
    const allowed = new Set(batch);
    const candidates = (response.candidates ?? []).filter(candidate => allowed.has(candidate.canonicalKey));
    const succeeded = new Set(candidates.map(candidate => candidate.canonicalKey));
    const failures = (response.failures ?? []).filter(failure => allowed.has(failure.canonicalKey) && !succeeded.has(failure.canonicalKey));
    const accounted = new Set([...succeeded, ...failures.map(failure => failure.canonicalKey)]);
    for (const canonicalKey of batch) if (!accounted.has(canonicalKey)) failures.push({ canonicalKey, name: nameFor(canonicalKey),
      code: 'PILOT_VISUAL_RESULT_MISSING', message: '本项没有返回结果，请仅重试此项' });
    onBatch({ candidates, failures });
    progress.completed += batch.length;
    progress.succeeded += succeeded.size;
    progress.failed += failures.length;
    progress.remaining = progress.total - progress.completed;
    onProgress({ ...progress });
  }
  return { aborted: false, progress };
}

export function mergeVisualProposalResults<T extends VisualProposalCandidate>(
  current: Record<string, T>, pendingFailures: Record<string, VisualProposalFailure>, result: { candidates: T[]; failures: VisualProposalFailure[] },
) {
  const proposals = { ...current }, failures = { ...pendingFailures };
  for (const candidate of result.candidates) { proposals[candidate.canonicalKey] = candidate; delete failures[candidate.canonicalKey]; }
  for (const failure of result.failures) failures[failure.canonicalKey] = failure;
  return { proposals, failures, successfulCount: result.candidates.length, failedCount: result.failures.length };
}
