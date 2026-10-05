export type DraftImageJob = { id: string; canonicalKey: string; sourceAssetRevision: number;
  executionPurpose?: string | null; projectId?: number; scriptId?: number; status: 'QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'STALE'|'CANCELLED'; outputs?: { artifactId: string }[];
  errorCode?: string | null; errorMessage?: string | null };

const labels: Record<DraftImageJob['status'], string> = {
  QUEUED: '排队中', RUNNING: '生成中', SUCCEEDED: '草图已生成', FAILED: '生成失败',
  STALE: '旧草图', CANCELLED: '已取消',
};

export function currentDraftImageJob(asset: { canonicalKey: string; revision: number },
  draftPackage: { imageJobId?: string | null; stage?: string } | null | undefined, jobs: DraftImageJob[]) {
  if (!draftPackage?.imageJobId || draftPackage.stage !== 'WAITING_IMAGE_EXECUTOR') return null;
  return jobs.find(job => job.id === draftPackage.imageJobId && job.canonicalKey === asset.canonicalKey &&
    Number(job.sourceAssetRevision) === Number(asset.revision)) ?? null;
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
