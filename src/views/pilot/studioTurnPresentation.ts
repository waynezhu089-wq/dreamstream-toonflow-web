export function formatStudioElapsed(milliseconds:number){const seconds=Math.max(0,Math.floor(milliseconds/1000));return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
export async function studioAssistantMessageId(userMessageId:string){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`v04-studio-assistant:${userMessageId}`));
 const hash=Array.from(new Uint8Array(bytes)).map(x=>x.toString(16).padStart(2,'0')).join('');
 return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}
export function candidateTurnAnchor(candidate:any,messages:any[],assistantId?:string){
 if(!candidate.userMessageId)return null;
 if(assistantId&&messages.some(m=>m.id===assistantId))return assistantId;
 const local=messages.find(m=>m.relatedUserMessageId===candidate.userMessageId&&m.role==='assistant');
 return local?.id??(messages.some(m=>m.id===candidate.userMessageId)?candidate.userMessageId:null);
}
export function composerHeight(value:unknown,workspaceHeight:number){const max=Math.max(80,Math.min(420,workspaceHeight*.45));const number=Number(value);return Math.max(80,Math.min(max,Number.isFinite(number)&&number>0?number:140));}
export function studioChromeText(value:unknown,fallback='这次操作未完成，可以让 Agent 检查，或在专业模式查看详情。'){
 const text=String(value||'');if(/CUDA|\bOOM\b|Comfy|workflow|executor|node error|[A-Z]:[\\/]|prompt ID/i.test(text))return fallback;
 return text.replace(/Visual Spec|视觉规格|视觉草案/g,'视觉描述').replace(/Prompt IR|Prompt Build/g,'制作说明').replace(/ASSET_BIBLE/g,'素材参考').replace(/草案/g,'方案').replace(/基准图/g,'当前版本');
}
