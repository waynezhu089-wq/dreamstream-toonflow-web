import {reactive} from 'vue';
type Scope={projectId:number;scriptId:number};
export function useAssetPreparationFeedback(deps:{post:(body:any)=>Promise<any>;current:(body:any)=>Promise<any>;confirm:()=>boolean;uuid:()=>string;storage?:Storage}){
 const state=reactive({phase:'IDLE',message:'',code:'',requestId:'',batchId:'',busy:false,runtimeRevision:'',runtimeProtocol:''});
 let scope:Scope|null=null,generation=0,pending:any=null;
 const storageKey=(s:Scope)=>`v04.asset-preparation:${s.projectId}:${s.scriptId}`;
 function save(){if(!scope)return;try{if(pending)deps.storage?.setItem(storageKey(scope),JSON.stringify(pending));else deps.storage?.removeItem(storageKey(scope));}catch{}}
 function bind(next:Scope|null){if(JSON.stringify(next)===JSON.stringify(scope))return;generation++;scope=next;pending=null;Object.assign(state,{phase:'IDLE',message:'',code:'',requestId:'',batchId:'',busy:false});try{const raw=next&&deps.storage?.getItem(storageKey(next));if(raw){pending=JSON.parse(raw);if(pending.projectId!==next!.projectId||pending.scriptId!==next!.scriptId)pending=null;}}catch{}if(pending)Object.assign(state,{phase:'UNCERTAIN',message:'上次提交结果尚未确认，请先检查状态。',requestId:pending.requestId});}
 function observe(data:any){if(data?.runtime){state.runtimeRevision=data.runtime.revision||'';state.runtimeProtocol=data.runtime.protocol||'';}if(!pending&&!state.busy&&data?.blocker&&data?.latest?.phase!=='ATTENTION'){Object.assign(state,{phase:'REJECTED',message:data.blocker.message,code:data.blocker.code});return;}if(state.phase==='REJECTED'&&!pending&&!data?.latest?.errorCode)return;const record=pending?data?.request:data?.latest;if(!record)return;
  if(pending&&record.requestId!==pending.requestId)return;
  state.requestId=record.requestId||state.requestId;state.batchId=record.batchId||record.id||'';
  if(record.phase==='ATTENTION'||record.errorCode||record.failures?.length){state.phase='FAILED';state.code=record.errorCode||record.failures?.[0]?.code||'ASSET_PREPARATION_FAILED';state.message=`本批次准备失败或部分失败：${state.code}。请查看需要关注的素材。`;}
  else if(record.phase==='PREPARING'){state.phase='SUBMITTED';state.message='已提交，正在准备本批次视觉草案；图片尚未完成。';}
  else if(record.phase==='ADMITTED'){state.phase='ADMITTED';state.message='本批次已入队，请继续查看 Krea2 → Klein 主图 → Klein 多视图进度。';}
  if(pending){pending=null;save();}
 }
 async function check(){if(!scope||state.busy)return;const own=generation;state.busy=true;try{const data=await deps.current({...scope,...(pending?{requestId:pending.requestId}:{})});if(own===generation){observe(data);if(state.phase==='UNCERTAIN')state.message='暂未查到该请求的准备记录；不要创建新批次，可重试同一提交。';}return data;}catch{if(own===generation){state.phase='UNCERTAIN';state.message='状态查询暂时失败，请稍后检查；没有重新提交。';}}finally{if(own===generation)state.busy=false;}}
 async function run(regenerate=false,canonicalKey?:string,retry=false){if(!scope||state.busy)return null;
  if(pending&&!retry){await check();return null;}
  if(!deps.confirm())return null;
  const own=generation,body=retry&&pending?pending:{...scope,regenerate,requestId:deps.uuid(),...(canonicalKey?{canonicalKey}:{})};
  pending=body;save();Object.assign(state,{phase:'SUBMITTING',message:'正在提交准备请求…',code:'',requestId:body.requestId,busy:true});
  try{const result=await deps.post(body);if(own!==generation)return null;
   state.batchId=result.batchId||'';state.phase=result.status||'UNCERTAIN';
   const messages:Record<string,string>={SUBMITTED:'新批次已提交，正在准备；图片尚未完成。',REPLAYED:'同一请求已存在，正在查看原批次；没有创建第二轮。',ALREADY_RUNNING:'已有批次正在准备，本次没有新建批次。',ALREADY_PREPARED:'现有批次已受理；如需新结果，请使用一键重新准备全部资产。'};
   state.message=messages[state.phase]||'后端未返回明确受理状态，请检查状态。';
   if(result.status){pending=null;save();}
   try{const data=await deps.current({...scope,requestId:result.requestId||body.requestId});if(own===generation){if(result.status==='REPLAYED'||result.status==='SUBMITTED')observe({...data,latest:data.request});else if(result.status==='ALREADY_RUNNING')observe(data);}}catch{if(own===generation)state.message+=' 状态刷新暂时失败，请稍后查看；不要重复提交。';}return result;
  }catch(e:any){if(own!==generation)return null;if(!pending&&['SUBMITTED','ADMITTED','FAILED'].includes(state.phase))return null;
   const detail=e?.response?.data??e;
   if(typeof detail?.code==='string'&&!['ECONNABORTED','ETIMEDOUT','ERR_NETWORK'].includes(detail.code)&&(!e.isAxiosError||e.response)){state.phase='REJECTED';state.code=detail.code;state.message=detail.message||'后端拒绝了本次准备请求。';pending=null;save();}
   else{state.phase='UNCERTAIN';state.message='提交响应未确认，可能已受理。请检查状态，暂勿再创建批次。';}
   return null;
  }finally{if(own===generation)state.busy=false;}
 }
 return {state,bind,run,check,observe};
}
