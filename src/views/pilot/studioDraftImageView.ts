export type DraftImageJob = { id: string; canonicalKey: string; sourceAssetRevision: number;
  executionPurpose?: string | null; projectId?: number; scriptId?: number; status: 'QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'STALE'|'CANCELLED'; outputs?: { artifactId: string; role?: string }[];
  errorCode?: string | null; errorMessage?: string | null };

const labels: Record<DraftImageJob['status'], string> = {
  QUEUED: '排队中', RUNNING: '生成中', SUCCEEDED: '草图已生成', FAILED: '生成失败',
  STALE: '旧草图', CANCELLED: '已取消',
};

export function currentDraftImageJob(asset: { canonicalKey: string; revision: number },
  draftPackage: { imageJobId?: string | null; stage?: string; projectId?: number; scriptId?: number } | null | undefined,
  jobs: DraftImageJob[], scope?: { projectId: number; scriptId: number } | null) {
  const identity = (job: DraftImageJob) => job.canonicalKey === asset.canonicalKey &&
    Number(job.sourceAssetRevision) === Number(asset.revision);
  if (draftPackage?.imageJobId) {
    if (draftPackage.stage !== 'WAITING_IMAGE_EXECUTOR') return null;
    return jobs.find(job => job.id === draftPackage.imageJobId && identity(job)) ?? null;
  }
  const projectId = scope?.projectId ?? draftPackage?.projectId;
  const scriptId = scope?.scriptId ?? draftPackage?.scriptId;
  if (projectId == null || scriptId == null) return null;
  // Persisted jobs arrive in createdAt DESC order; never substitute another purpose.
  return jobs.find(job => identity(job) && job.projectId === projectId && job.scriptId === scriptId &&
    (job.executionPurpose == null || job.executionPurpose === 'SUBJECT_MAIN_PREVIEW') &&
    ['QUEUED','RUNNING','SUCCEEDED','FAILED'].includes(job.status) &&
    !job.outputs?.some(output => output.role != null && output.role !== 'MAIN_PREVIEW')) ?? null;
}

export function draftImageStatus(job: DraftImageJob | null) { return job ? labels[job.status] : null; }

export function currentDraftImageJobForPurpose(asset: { canonicalKey: string; revision: number },
  draftPackage: { imageJobsByPurpose?: Record<string,string>; projectId?: number; scriptId?: number; stage?: string } | null | undefined,
  jobs: DraftImageJob[], executionPurpose: string) {
  if (!draftPackage || draftPackage.stage !== 'WAITING_IMAGE_EXECUTOR') return null;
  const match = (job: DraftImageJob) => job.canonicalKey === asset.canonicalKey &&
    Number(job.sourceAssetRevision) === Number(asset.revision) && job.executionPurpose === executionPurpose &&
    (draftPackage.projectId == null || job.projectId === draftPackage.projectId) &&
    (draftPackage.scriptId == null || job.scriptId === draftPackage.scriptId);
  const id = draftPackage.imageJobsByPurpose?.[executionPurpose];
  return (id ? jobs.find(job => job.id === id && match(job)) : jobs.find(job => match(job) && ['QUEUED','RUNNING','SUCCEEDED','FAILED'].includes(job.status))) ?? null;
}
