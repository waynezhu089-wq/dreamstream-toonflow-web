export function currentAssetPackage(asset:any,jobs:any[],scope?:{projectId:number;scriptId:number}){
 const scoped=jobs.filter(j=>(!scope||j.projectId===scope.projectId&&j.scriptId===scope.scriptId)&&j.canonicalKey===asset.canonicalKey&&j.sourceAssetRevision===asset.revision);
 const root=scoped.find(j=>j.packageStage==='DRAFT_KREA'&&!['STALE','CANCELLED'].includes(j.status));
 if(!root){const stale=scoped.find(j=>j.packageStage==='DRAFT_KREA'&&j.status==='STALE');return stale?{id:stale.packageId,root:stale,main:null,views:[],label:'已过期 · 请重新准备',updatedAt:stale.updatedAt||stale.createdAt}:null;}
 const members=scoped.filter(j=>j.packageId===root.packageId&&!['STALE','CANCELLED'].includes(j.status));
 const main=members.find(j=>j.packageStage==='CANONICAL_MAIN_KLEIN');
 const views=members.filter(j=>j.packageStage==='MULTIVIEW_KLEIN');
 const failed=members.some(j=>j.status==='FAILED');
 const label=failed?'失败，可重试':root.status!=='SUCCEEDED'?'Krea2 主视图草稿中':!main||main.status!=='SUCCEEDED'?'Klein 主视图生成中':(views.some(j=>['QUEUED','RUNNING'].includes(j.status))||!views.length&&['HUMAN_CHARACTER','CREATURE','VEHICLE','PROP'].includes(asset.assetKind))?'Klein 多视图生成中':'已完成 · 待人工审查';
 return {id:root.packageId,root,main,views,label,updatedAt:Math.max(...members.map(j=>j.updatedAt||j.createdAt||0))};
}

export function isConversationalPackageCandidate(c:any){return !!c.userMessageId&&c.packageStage==='CANONICAL_MAIN_KLEIN';}
