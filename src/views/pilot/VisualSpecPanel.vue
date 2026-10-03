<template>
  <section class="visual-spec" aria-label="视觉规格">
    <header class="spec-header"><div><h3>视觉规格</h3><p>资产是谁由素材圣经定义；这里确认它稳定的外观。Prompt 是可重建的派生内容。</p></div></header>
    <div class="spec-summary">
      <span>语义 · 已确认 v{{ asset.revision }}</span>
      <span>视觉规格 · {{ visualStatus }}</span>
      <span>Prompt · {{ promptStatus }}</span>
    </div>
    <div v-if="row && !draft" class="spec-counts">
      <span>身份锚点 {{ row.spec.identityAnchors.length }}</span><span>必须保留 {{ row.spec.mustPreserve.length }}</span>
      <span>禁止改变 {{ row.spec.forbiddenChanges.length }}</span><span>附属元素 {{ row.spec.embeddedElements.length }}</span>
    </div>
    <p v-if="referenceOnly" class="reference-note">真实品牌／界面仅从已确认参考提取约束，不会交给 AI 重绘。</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="spec-actions">
      <button type="button" :class="{working:working&&feedback.key==='propose'}" :disabled="working" @click="proposeOne">{{ actionLabel('propose','生成视觉规格草案') }}</button>
      <button type="button" :class="{working:working&&feedback.key==='batch'}" :disabled="working" @click="proposeBatch">{{ actionLabel('batch','批量生成全部待处理资产') }}</button>
      <button v-if="Object.keys(batchFailures).length" type="button" :class="{working:working&&feedback.key==='retryBatch'}" :disabled="working" @click="retryFailedBatch">{{ actionLabel('retryBatch','只重试失败项') }}</button>
      <button v-if="row && !draft" type="button" :disabled="working" @click="editConfirmed">编辑已确认规格</button>
      <button v-if="row?.effectiveStatus==='CONFIRMED' && promptStatus==='STALE' && !referenceOnly" type="button" :class="{working:working&&feedback.key==='rebuild'}" :disabled="working" @click="rebuildPrompt">{{ actionLabel('rebuild','重建 Prompt') }}</button>
    </div>
    <p v-if="working && batchRun" class="muted" role="status">正在批量生成视觉规格… 已完成 {{ batchRun.completed }} / {{ batchRun.total }}，失败 {{ batchRun.failed }}，剩余 {{ batchRun.remaining }}</p>
    <p v-else-if="batchSummary" class="muted" role="status">{{ batchSummary.total }} 项处理中完成，{{ batchSummary.succeeded }} 项已生成，{{ batchSummary.failed }} 项需要重试，剩余 0。选择相应资产卡片继续审查。</p>
    <div v-if="Object.keys(batchFailures).length" class="batch-failures" aria-label="视觉规格待重试项"><p v-for="failure in batchFailures" :key="failure.canonicalKey">{{ failure.name }}（{{ failure.canonicalKey }}）：{{ failure.message }} <small>{{ failure.code }}</small><button type="button" :disabled="working" @click="retryFailed(failure.canonicalKey)">仅重试此项</button></p></div>
    <div v-if="row && !draft"><button type="button" class="text-action" @click="showDetails=!showDetails">{{ showDetails ? '收起已确认细节' : '查看已确认细节' }}</button>
      <div v-if="showDetails" class="confirmed-detail"><p><strong>外观：</strong>{{ row.spec.visualIdentitySummary }} · {{ row.spec.silhouette }}</p><p><strong>色彩：</strong>{{ row.spec.primaryPalette.join('、') || '待补充' }}</p><p><strong>材质：</strong>{{ row.spec.materials.join('、') || '待补充' }}</p><p v-for="element in highElements(row.spec)" :key="element.embeddedElementId"><strong>建议独立资产：</strong>{{ element.name }} · {{ element.placement }}</p></div>
    </div>
    <div v-if="draft" class="spec-draft">
      <p class="muted">草案仅在当前页面。修改任何字段后需要重新预览；确认前不会写入正式 Visual Spec。</p>
      <p v-if="draftDiagnostics?.normalizationWarnings?.length" class="muted">已自动整理 {{ draftDiagnostics.normalizationWarnings.length }} 项输入格式；请核对草案内容。</p>
      <div v-if="draftDiagnostics?.qualityWarnings?.length" class="quality-warnings"><strong>需要人工确认的身份细节</strong><p v-for="warning in draftDiagnostics.qualityWarnings" :key="warning.path">{{ warning.path }}：存在未定选择，请在预览前明确。</p></div>
      <h4>外观</h4>
      <label>视觉身份摘要<textarea v-model="draft.visualIdentitySummary" rows="2" @input="dirty" /></label>
      <label>轮廓<textarea v-model="draft.silhouette" rows="2" @input="dirty" /></label>
      <div class="field-row"><label>尺度<input v-model="draft.scale" @input="dirty" /></label><label>比例<input v-model="draft.proportion" @input="dirty" /></label></div>
      <h4>材质与色彩</h4>
      <label>主色（一行一个）<textarea :value="joined(draft.primaryPalette)" rows="2" @input="setLines('primaryPalette',$event)" /></label>
      <label>辅色（一行一个）<textarea :value="joined(draft.secondaryPalette)" rows="2" @input="setLines('secondaryPalette',$event)" /></label>
      <label>材质（一行一个）<textarea :value="joined(draft.materials)" rows="2" @input="setLines('materials',$event)" /></label>
      <label>表面语言<textarea v-model="draft.surfaceLanguage" rows="2" @input="dirty" /></label>
      <h4>连续性与生成约束</h4>
      <label>独特特征<textarea :value="joined(draft.distinctiveFeatures)" rows="2" @input="setLines('distinctiveFeatures',$event)" /></label>
      <label>连续性说明<textarea :value="joined(draft.continuityNotes)" rows="2" @input="setLines('continuityNotes',$event)" /></label>
      <label>身份锚点<textarea :value="joined(draft.identityAnchors)" rows="2" @input="setLines('identityAnchors',$event)" /></label>
      <label>必须保留<textarea :value="joined(draft.mustPreserve)" rows="2" @input="setLines('mustPreserve',$event)" /></label>
      <label>禁止改变<textarea :value="joined(draft.forbiddenChanges)" rows="2" @input="setLines('forbiddenChanges',$event)" /></label>
      <h4>{{ kindLabel(draft.assetKind) }} 细节</h4>
      <div v-for="field in detailFields" :key="field.path">
        <label v-if="field.path!=='emptyEnvironmentPolicy' && !field.path.startsWith('states.')">{{ field.path }}<textarea :value="field.value" rows="2" @input="setDetail(field.path,$event)" /></label>
      </div>
      <label v-if="draft.assetKind==='ENVIRONMENT'">环境主体策略<select v-model="draft.details.emptyEnvironmentPolicy" @change="dirty"><option value="EMPTY_CANONICAL_REFERENCE">默认空环境</option><option value="SUBJECTS_ALLOWED">允许明确主体</option></select></label>
      <div v-if="draft.assetKind==='MATERIAL_FX'"><label v-for="state in draft.details.states" :key="state.key">{{ state.key }} 状态<textarea v-model="state.appearance" rows="2" @input="dirty" /></label></div>
      <h4>附属元素 <small>只突出 HIGH，不自动创建资产</small></h4>
      <article v-for="(element,i) in draft.embeddedElements" :key="element.embeddedElementId" class="embedded"><div class="field-row"><label>名称<input v-model="element.name" @input="dirty" /></label><label>放置位置<input v-model="element.placement" @input="dirty" /></label></div><label>视觉描述<textarea v-model="element.visualDescription" rows="2" @input="dirty" /></label><div class="field-row"><label>连续性<select v-model="element.continuityImportance" @change="dirty"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label><label>独立资产建议<select v-model="element.promotionRecommendation" @change="dirty"><option>LOW</option><option>MEDIUM</option><option>HIGH</option></select></label></div><button type="button" @click="draft.embeddedElements.splice(i,1);dirty()">移除元素</button></article>
      <button type="button" @click="addElement">＋ 添加附属元素</button>
      <div class="spec-actions"><button type="button" :class="{working:working&&feedback.key==='preview'}" :disabled="working" @click="previewSpec">{{ actionLabel('preview',preview ? '重新预览' : '预览更改') }}</button><button v-if="preview" type="button" :class="{working:working&&feedback.key==='apply'}" :disabled="working || preview.issues.length>0" @click="applySpec">{{ actionLabel('apply','确认视觉规格') }}</button><button type="button" :disabled="working" @click="discard">丢弃草案</button></div>
      <div v-if="preview" class="spec-preview"><strong>确认前预览 · v{{ preview.nextRevision }}</strong><p>来源资产版本 {{ preview.sourceAssetRevision }}。确认后将同步身份锚点、必须保留和禁止改变；旧 Prompt 会过期。</p><p v-if="preview.issues.length" class="error">请先补齐：{{ preview.issues.join('、') }}</p><div v-for="change in changedFields" :key="change.key" class="diff-row"><strong>{{ change.key }}</strong><div><span>当前：{{ change.before }}</span><span>提议：{{ change.after }}</span></div></div><p>Prompt 将从确认后的规格自动编译，不调用图片模型。</p></div>
    </div>
    <div v-if="readyPrompt && !draft" class="prompt-preview"><button type="button" class="text-action" @click="showPrompt=!showPrompt">{{ showPrompt ? '收起 Prompt IR' : '查看派生 Prompt IR' }}</button><div v-if="showPrompt"><p>意图：{{ readyPrompt.generationIntent }} · 编译器：{{ readyPrompt.compilerVersion }}</p><p>{{ readyPrompt.renderedPrompt.text }}</p><p class="muted">仅供审查的通用文本；尚未执行图片生成。</p></div></div>
  </section>
</template>
<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import axios from '@/utils/axios';
import { useV04ProposalWorkspace } from '@/stores/v04ProposalWorkspace';
import { beginPilotAction, settlePilotAction, type PilotActionFeedback } from './pilotActionFeedback';
import { mergeVisualProposalResults, pendingVisualProposalKeys, runVisualProposalBatches, type VisualBatchProgress } from './visualProposalBatch';

const props=defineProps<{projectId:number;scriptId:number;asset:any;allAssets:any[];visualSpecs:any[];promptBuilds:any[]}>();
const emit=defineEmits<{(e:'applied'):void}>();
const draft=ref<any>(null), preview=ref<any>(null), error=ref(''), showDetails=ref(false), showPrompt=ref(false);
const workspace=useV04ProposalWorkspace();
workspace.setScope(props.projectId,props.scriptId);
const proposals=computed(()=>workspace.current().visualSpecProposals);
const batchFailures=computed(()=>workspace.current().visualSpecFailures);
const {batchRun}=storeToRefs(workspace);
const batchSummary=computed<VisualBatchProgress|null>({get:()=>workspace.current().batchSummary,set:value=>{workspace.current().batchSummary=value;}});
const batchKeys=computed<string[]>({get:()=>workspace.current().batchKeys,set:value=>{workspace.current().batchKeys=value;}});
let scopeVersion=0;
const feedback=reactive<PilotActionFeedback>({key:'',phase:'IDLE',message:''});
const working=computed(()=>feedback.phase==='WORKING');
const row=computed(()=>props.visualSpecs.find(item=>item.canonicalKey===props.asset.canonicalKey));
const readyPrompt=computed(()=>props.promptBuilds.find(item=>item.canonicalKey===props.asset.canonicalKey&&item.effectiveStatus==='READY'));
const draftDiagnostics=computed(()=>proposals.value[props.asset.canonicalKey]);
const referenceOnly=computed(()=>props.asset.sourcePolicy==='REAL_REQUIRED'||['BRAND','UI'].includes(props.asset.category));
const visualStatus=computed(()=>draft.value?'待确认':row.value?.effectiveStatus==='STALE'?'已过期':row.value?'已确认':'未生成');
const promptStatus=computed(()=>referenceOnly.value?'真实参考专用':readyPrompt.value?'READY':props.promptBuilds.some(item=>item.canonicalKey===props.asset.canonicalKey)?'STALE':'未准备');
watch(()=>props.asset.canonicalKey,key=>{draft.value=proposals.value[key]?JSON.parse(JSON.stringify(proposals.value[key].spec)):null;preview.value=null;error.value='';showDetails.value=false;showPrompt.value=false;},{immediate:true});
watch(()=>[props.projectId,props.scriptId],()=>{scopeVersion++;workspace.setScope(props.projectId,props.scriptId);draft.value=proposals.value[props.asset.canonicalKey]?JSON.parse(JSON.stringify(proposals.value[props.asset.canonicalKey].spec)):null;preview.value=null;batchRun.value=null;error.value='';Object.assign(feedback,{key:'',phase:'IDLE',message:''});});
watch(draft,value=>{if(value&&props.asset){const existing=proposals.value[props.asset.canonicalKey];workspace.putVisual({...existing,canonicalKey:props.asset.canonicalKey,sourceAssetRevision:existing?.sourceAssetRevision ?? props.asset.revision,spec:JSON.parse(JSON.stringify(value))});}},{deep:true});
const highElements=(spec:any)=>spec.embeddedElements.filter((e:any)=>e.promotionRecommendation==='HIGH');
const detailFields=computed(()=>{const fields:{path:string;value:string}[]=[];function walk(value:any,path:string){if(typeof value==='string')fields.push({path,value});else if(Array.isArray(value)){if(value.every(v=>typeof v==='string'))fields.push({path,value:value.join('\n')});}else if(value&&typeof value==='object')for(const [key,child] of Object.entries(value))walk(child,path?`${path}.${key}`:key);}if(draft.value)walk(draft.value.details,'');return fields;});
const changedFields=computed(()=>{if(!preview.value)return [];const before=preview.value.currentSpec||{};const after=preview.value.proposed;return Object.keys(after).filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>({key,before:before[key]===undefined?'（尚无）':previewText(before[key]),after:previewText(after[key])}));});
function previewText(value:any){if(typeof value==='string')return value;const text=JSON.stringify(value);return text.length>300?`${text.slice(0,300)}…（完整内容见上方编辑区）`:text;}
const joined=(value:string[])=>value.join('\n');
const kindLabel=(kind:string)=>({HUMAN_CHARACTER:'人物',CREATURE:'生物',VEHICLE:'载具',ENVIRONMENT:'环境',MATERIAL_FX:'材质／特效',CELESTIAL:'天体',BRAND_MARK:'品牌标识',UI_REFERENCE:'真实界面'} as Record<string,string>)[kind]||'资产';
function dirty(){preview.value=null;}
function setLines(field:string,event:Event){draft.value[field]=(event.target as HTMLTextAreaElement).value.split('\n').map(s=>s.trim()).filter(Boolean);dirty();}
function setDetail(path:string,event:Event){const parts=path.split('.');let target=draft.value.details;for(const part of parts.slice(0,-1))target=target[part];const current=target[parts.at(-1)!];const raw=(event.target as HTMLTextAreaElement).value;target[parts.at(-1)!]=Array.isArray(current)?raw.split('\n').map(s=>s.trim()).filter(Boolean):raw;dirty();}
function addElement(){draft.value.embeddedElements.push({embeddedElementId:`embedded-${crypto.randomUUID()}`,name:'',visualDescription:'',placement:'',continuityImportance:'LOW',promotionRecommendation:'LOW',suggestedCategory:null,suggestedAssetKind:null});dirty();}
const api=async(path:string,body:object)=>{const response:any=await axios.post(`/v04${path}`,body);return response.data;};
const actionLabel=(key:string,normal:string)=>feedback.key===key&&feedback.phase!=='IDLE'?feedback.message:normal;
async function action<T>(key:string,message:string,run:()=>Promise<T>):Promise<T|undefined>{if(!beginPilotAction(feedback,key,message))return;const version=scopeVersion,projectId=props.projectId,scriptId=props.scriptId;error.value='';try{const result=await run();if(version===scopeVersion&&projectId===props.projectId&&scriptId===props.scriptId)settlePilotAction(feedback,key,'SUCCESS','已完成');return result;}catch(e:any){if(version===scopeVersion&&projectId===props.projectId&&scriptId===props.scriptId){error.value=e?.response?.data?.message||e?.message||'操作失败，请重试';settlePilotAction(feedback,key,'FAILURE','失败 · 重试');}}}
function mergeBatch(result:any){const merged=mergeVisualProposalResults(proposals.value,batchFailures.value,result);Object.assign(proposals.value,merged.proposals);for(const key of Object.keys(batchFailures.value))if(!merged.failures[key])delete batchFailures.value[key];Object.assign(batchFailures.value,merged.failures);const selected=result.candidates.find((candidate:any)=>candidate.canonicalKey===props.asset.canonicalKey);if(selected){draft.value=JSON.parse(JSON.stringify(selected.spec));preview.value=null;}}
function updateSummary(){if(!batchKeys.value.length)return;const failed=batchKeys.value.filter(key=>Boolean(batchFailures.value[key])).length;const succeeded=batchKeys.value.filter(key=>Boolean(proposals.value[key])&&!batchFailures.value[key]).length;batchSummary.value={total:batchKeys.value.length,completed:batchKeys.value.length,succeeded,failed,remaining:0};}
async function runBatch(keys:string[],actionKey:string){const token={projectId:props.projectId,scriptId:props.scriptId,version:scopeVersion};const isCurrent=()=>token.projectId===props.projectId&&token.scriptId===props.scriptId&&token.version===scopeVersion;const names=new Map(props.allAssets.map(asset=>[asset.canonicalKey,asset.name]));await action(actionKey,'正在批量生成视觉规格…',async()=>{const result=await runVisualProposalBatches(keys,canonicalKeys=>api('/visual-spec/propose',{projectId:token.projectId,scriptId:token.scriptId,canonicalKeys}),mergeBatch,progress=>{batchRun.value=progress;},isCurrent,key=>names.get(key)||key);if(!result.aborted){updateSummary();if(result.progress.succeeded===0)throw new Error('本次没有生成草案，请只重试失败项');}return result;});if(isCurrent())batchRun.value=null;}
async function proposeOne(){if(!referenceOnly.value&&!window.confirm('将调用已配置文本模型生成草案，可能产生费用。继续吗？'))return;const token={projectId:props.projectId,scriptId:props.scriptId,canonicalKey:props.asset.canonicalKey};await action('propose','正在分析视觉规格…',async()=>{const result=await api('/visual-spec/propose',{projectId:token.projectId,scriptId:token.scriptId,canonicalKeys:[token.canonicalKey]});if(token.projectId!==props.projectId||token.scriptId!==props.scriptId)return;const candidate=result.candidates[0];if(!candidate)throw new Error(result.failures?.[0]?.message||'未返回视觉草案');workspace.putVisual(candidate);updateSummary();if(props.asset.canonicalKey===token.canonicalKey){draft.value=JSON.parse(JSON.stringify(candidate.spec));preview.value=null;}return candidate;});}
async function proposeBatch(){const keys=pendingVisualProposalKeys(props.allAssets,props.visualSpecs);if(!keys.length){error.value='没有待生成的 AI 视觉规格';return;}if(!window.confirm(`将使用文本模型为 ${keys.length} 项资产生成草案，可能产生费用。继续吗？`))return;batchKeys.value=keys;batchSummary.value=null;await runBatch(keys,'batch');}
async function retryFailedBatch(){const eligible=new Set(pendingVisualProposalKeys(props.allAssets,props.visualSpecs));const keys=Object.keys(batchFailures.value).filter(key=>eligible.has(key));if(!keys.length){error.value='没有待重试的资产';return;}if(!window.confirm(`将只重试 ${keys.length} 项失败资产，可能产生费用。继续吗？`))return;await runBatch(keys,'retryBatch');}
async function retryFailed(canonicalKey:string){if(!window.confirm('将仅为此项调用已配置文本模型，可能产生费用。继续吗？'))return;const projectId=props.projectId,scriptId=props.scriptId;await action('retry','正在重试此项…',async()=>{const result=await api('/visual-spec/propose',{projectId,scriptId,canonicalKeys:[canonicalKey]});if(projectId!==props.projectId||scriptId!==props.scriptId)return;mergeBatch(result);updateSummary();return result;});}
function editConfirmed(){if(!row.value)return;workspace.removeVisual(props.asset.canonicalKey);draft.value=JSON.parse(JSON.stringify(row.value.spec));preview.value=null;}
async function previewSpec(){const token={projectId:props.projectId,scriptId:props.scriptId,canonicalKey:props.asset.canonicalKey,revision:proposals.value[props.asset.canonicalKey]?.sourceAssetRevision ?? props.asset.revision};if(Number(token.revision)!==Number(props.asset.revision)){error.value='素材身份已变化，请丢弃过期草案后重新生成';return;}await action('preview','正在预览视觉规格…',async()=>{const result=await api('/visual-spec/preview',{projectId:token.projectId,scriptId:token.scriptId,canonicalKey:token.canonicalKey,sourceAssetRevision:token.revision,spec:draft.value});if(token.projectId===props.projectId&&token.scriptId===props.scriptId&&token.canonicalKey===props.asset.canonicalKey)preview.value=result;return result;});}
async function applySpec(){if(!preview.value)return;const token={projectId:props.projectId,scriptId:props.scriptId,canonicalKey:props.asset.canonicalKey,revision:proposals.value[props.asset.canonicalKey]?.sourceAssetRevision ?? props.asset.revision};if(Number(token.revision)!==Number(props.asset.revision)){error.value='素材身份已变化，不能确认过期草案';return;}await action('apply','正在确认视觉规格…',async()=>{const result=await api('/visual-spec/apply',{projectId:token.projectId,scriptId:token.scriptId,canonicalKey:token.canonicalKey,sourceAssetRevision:token.revision,spec:draft.value,previewHash:preview.value.previewHash});if(token.projectId===props.projectId&&token.scriptId===props.scriptId){draft.value=null;preview.value=null;workspace.removeVisual(token.canonicalKey);emit('applied');}return result;});}
async function rebuildPrompt(){const token={projectId:props.projectId,scriptId:props.scriptId,canonicalKey:props.asset.canonicalKey};await action('rebuild','正在重建 Prompt…',async()=>{const result=await api('/visual-spec/prompt/rebuild',token);if(token.projectId===props.projectId&&token.scriptId===props.scriptId)emit('applied');return result;});}
function discard(){draft.value=null;preview.value=null;workspace.removeVisual(props.asset.canonicalKey);}
</script>
<style scoped>
.visual-spec{border-top:1px solid var(--td-component-border);margin-top:1.6rem;padding-top:1rem;color:var(--td-text-color-primary)}
.spec-header h3{margin:0;font-size:1rem}.spec-header p,.muted{font-size:.78rem;color:var(--td-text-color-secondary);line-height:1.5}
.spec-summary,.spec-counts,.spec-actions{display:flex;flex-wrap:wrap;gap:.5rem;margin:.8rem 0}.spec-summary span,.spec-counts span{font-size:.72rem;padding:.32rem .5rem;border:1px solid var(--td-component-border);border-radius:.3rem;background:var(--td-bg-color-secondarycontainer)}
.spec-actions button,.text-action,.embedded button{border:1px solid var(--td-component-border);background:var(--td-bg-color-container);color:var(--td-text-color-primary);border-radius:.35rem;padding:.5rem .7rem;cursor:pointer}.spec-actions button:hover:not(:disabled),.text-action:hover,.embedded button:hover{border-color:var(--td-brand-color);filter:brightness(1.08)}.spec-actions button:active:not(:disabled){transform:translateY(2px)}.spec-actions button:disabled{opacity:.7;cursor:wait}
.spec-actions button.working{color:var(--td-brand-color);border-color:var(--td-brand-color);opacity:1}.spec-actions button.working::before{content:"";display:inline-block;width:.7em;height:.7em;margin-right:.45em;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.reference-note{color:var(--td-warning-color);font-size:.78rem}.error{color:var(--td-error-color);font-size:.8rem}.spec-draft{margin-top:1rem}.spec-draft h4{font-size:.83rem;margin:1.3rem 0 .7rem;border-top:1px solid var(--td-component-border);padding-top:.8rem}.spec-draft h4 small{font-weight:400;color:var(--td-text-color-secondary)}
.diff-row{border-top:1px solid var(--td-component-border);padding:.5rem 0;font-size:.76rem}.diff-row>div{display:grid;grid-template-columns:1fr 1fr;gap:.6rem;margin-top:.3rem}.diff-row span{overflow-wrap:anywhere;color:var(--td-text-color-secondary)}
label{display:block;font-size:.77rem;margin:.65rem 0}input,textarea,select{display:block;box-sizing:border-box;width:100%;margin:.35rem 0;border:1px solid var(--td-component-border);background:var(--td-bg-color-container);color:var(--td-text-color-primary);border-radius:.35rem;padding:.5rem;font:inherit}.field-row{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}.embedded,.spec-preview,.confirmed-detail,.prompt-preview{border:1px solid var(--td-component-border);border-radius:.4rem;padding:.8rem;margin:.7rem 0;background:var(--td-bg-color-secondarycontainer)}.prompt-preview p,.confirmed-detail p,.spec-preview p{font-size:.78rem;line-height:1.5;overflow-wrap:anywhere}
</style>
