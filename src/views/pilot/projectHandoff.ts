export type PilotHandoffTarget = "assets" | "production";

type HandoffDependencies = {
  post: (path: string, body: { id: number }) => Promise<{ data: unknown[] }>;
  setProject: (project: any) => void;
  selectUnit: (projectId: number, scriptId: number) => void;
  navigate: (path: string) => Promise<unknown>;
};

export async function handoffToProjectPage(
  projectId: number,
  scriptId: number,
  target: PilotHandoffTarget,
  dependencies: HandoffDependencies,
) {
  const response = await dependencies.post("/general/getSingleProject", { id: projectId });
  const project = response.data?.[0];
  if (!project) throw new Error("当前项目未找到，请刷新后重试");

  dependencies.setProject(project);
  dependencies.selectUnit(projectId, scriptId);
  await dependencies.navigate(`/${target}?scriptId=${scriptId}`);
}
