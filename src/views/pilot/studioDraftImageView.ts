export type DraftImageJob = { id: string; canonicalKey: string; sourceAssetRevision: number;
  status: 'QUEUED'|'RUNNING'|'SUCCEEDED'|'FAILED'|'STALE'|'CANCELLED'; outputs?: { artifactId: string }[];
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
