export function pipelineProgressLabel(state:any):string {
  if(!state)return '';
  if(state.latest?.phase==='INITIAL_STARTED')return '正在整理故事与素材…';
  if(state.latest?.phase==='DIRECTOR_REVIEW')return '视觉方向已准备，请审阅并采用；随后自动准备资产图片。';
  if(state.latest?.phase==='PREPARING')return '正在准备资产视觉草案…';
  if(state.latest?.phase==='ATTENTION')return '资产准备需要关注；告诉 Agent 继续处理。';
  const c=state.coverage;
  if(!c)return '';
  const views=(c.items||[]).reduce((n:number,i:any)=>n+(i.packReady?.length||0),0);
  const working=c.firstDraftRunning+(c.items||[]).reduce((n:number,i:any)=>n+(i.packRunning?.length||0),0);
  return `主图候选 ${c.firstDraftReady}/${c.aiAllowed} · 视角候选 ${views} · 正在准备 ${working} · 需要关注 ${c.attentionCount||c.firstDraftFailed||0}`;
}
