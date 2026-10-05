import type {StudioReviewImage} from './studioImageReview';
export const cardRoles:Record<string,string[]>={HUMAN_CHARACTER:['FULL_BODY_FRONT','FACE_HERO','FULL_BODY_BACK'],CREATURE:['HERO_3Q','SIDE_PROFILE','BACK_3Q'],VEHICLE:['HERO_3Q','SIDE_PROFILE','REAR_3Q','DETAIL_REFERENCE'],PROP:['HERO_3Q','SIDE_PROFILE','DETAIL_REFERENCE']};
const labels:Record<string,string>={FACE_HERO:'头像',FULL_BODY_FRONT:'正面',FULL_BODY_BACK:'背面',HERO_3Q:'主视图',SIDE_PROFILE:'侧面',BACK_3Q:'后侧',REAR_3Q:'后侧',DETAIL_REFERENCE:'细节'};
export type CardReview=StudioReviewImage&{artifactId?:string;attachmentId?:string;jobId?:string};
export function assetCardReviewImages(item:any,drafts:Record<string,string>,references:Record<string,string>):CardReview[]{
 const result:CardReview[]=[],seen=new Set<string>();
 const add=(image:CardReview)=>{const key=image.artifactId?'artifact:'+image.artifactId:image.attachmentId?'attachment:'+image.attachmentId:image.src;if(!key||seen.has(key)||result.length>=4)return;seen.add(key);result.push(image);};
 const job=(j:any,label:string)=>{if(j?.status!=='SUCCEEDED'||j.decision==='REJECTED'||item.rejectedJobIds?.includes(j.id)||!j.outputs?.[0]?.artifactId)return;const output=j.outputs[0];add({id:j.id,jobId:j.id,candidateId:j.id,artifactId:output.artifactId,src:drafts[j.id]||'',label});};
 const baselineJob=[item.acceptedImageJob,item.readyMainJob,item.imageJob,...Object.values(item.referenceJobs||{})].find((j:any)=>j?.id===item.baseline?.sourceJobId);
 if(item.baseline)add({id:item.baseline.attachmentId,attachmentId:item.baseline.attachmentId,artifactId:item.baseline.sourceArtifactId||baselineJob?.outputs?.[0]?.artifactId,src:references[item.baseline.attachmentId]||'',label:'当前版本'});
 else job(item.acceptedImageJob,'当前版本');
 const roles=cardRoles[item.asset.assetKind]||[];
 const mainRoles=!roles.length?[]:item.asset.assetKind==='HUMAN_CHARACTER'?['FULL_BODY_FRONT','FACE_HERO']:['HERO_3Q'];
 if(!result.length)for(const role of mainRoles){job(item.referenceJobs?.[role],labels[role]);if(result.length)break;}
 if(!result.length)job(item.readyMainJob||item.imageJob,'主视图');
 for(const role of roles.filter(role=>!(item.baseline&&role==='HERO_3Q')))job(item.referenceJobs?.[role],labels[role]);
 if(!result.length||roles.length&&result.length<roles.length)job(item.readyMainJob||item.imageJob,'主视图');
 if(!result.length&&item.outputPath)add({id:'review',src:item.outputPath,label:'参考图'});
 if(!result.length)for(const ref of item.refs||[]){if(references[ref.attachmentId]){add({id:ref.attachmentId,attachmentId:ref.attachmentId,src:references[ref.attachmentId],label:'已确认参考'});break;}}
 return result;
}
