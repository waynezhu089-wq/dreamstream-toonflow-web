<template>
  <section class="multiview-pilot">
    <h2>Multi-View Pilot · Boy</h2><p>视角宽容，身份严格。仅实验；不替换主图，不加入 Reference Pack。</p>
    <button :disabled="busy" @click="compile">{{busy?'处理中…':'编译男孩 Side-ish / Back-ish'}}</button>
    <button :disabled="busy" @click="refresh">刷新实验状态</button><p v-if="error" role="alert">{{error}}</p>
    <select v-if="records.length" v-model="selectedId" aria-label="Multi-View 实验记录"><option v-for="r in records" :key="r.id" :value="r.id">{{r.canonicalKey}} · {{r.status}} · {{r.id.slice(0,8)}}</option></select>
    <template v-if="experiment">
      <p>{{experiment.canonicalKey}} · revision {{experiment.assetRevision}} · {{experiment.status}}</p>
      <div class="views">
        <article><h3>MAIN · 当前身份参考</h3><button v-if="images.MAIN" class="view-image" @click="enlarge('MAIN')"><img :src="images.MAIN" alt="男孩当前主身份图" /></button>
          <p>{{experiment.source.type}} · {{experiment.source.width}}×{{experiment.source.height}}</p>
          <p>图像身份优先；保留年龄、发型、体型、服装结构与鞋履状态，不使用旧衣着描述重设计。</p></article>
        <article v-for="side in sides" :key="side"><h3>{{side==='SIDE'?'SIDE-ish':'BACK-ish'}} · {{experiment.execution?.[side]?.status||'未执行'}}</h3>
          <p>保留：{{experiment[side].brief.preserve.join('；')}}</p><p>视角：{{experiment[side].brief.viewpointInstruction.join('；')}}</p>
          <p v-for="line in experiment[side].brief.conservativeInferenceRules" :key="line">{{line}}</p>
          <h4>最终 Krea 提示词</h4><pre>{{experiment[side].prompt}}</pre>
          <button v-if="images[side]" class="view-image" @click="enlarge(side)"><img :src="images[side]" :alt="side+' 实验视角'" /></button>
          <p v-if="experiment.execution?.[side]?.errorCode" role="alert">{{experiment.execution[side].errorCode}}</p>
        </article>
      </div>
      <p>相同参考、profile、参数与 seed {{experiment.sharedExecution.seed}}。同 seed 不是身份保证。</p>
      <details><summary>精确来源 / hashes / profile / graph</summary><pre>{{JSON.stringify({source:experiment.source,identityLock:experiment.identityLock,sourceHash:experiment.sourceHash,experimentHash:experiment.experimentHash,evidence:experiment.evidence,sharedExecution:experiment.sharedExecution,SIDE:experiment.SIDE,BACK:experiment.BACK},null,2)}}</pre></details>
      <label v-if="experiment.status==='COMPILED'"><input v-model="sourceReviewed" type="checkbox" /> 已人工核对主图完整、单一主体、无遮挡，并通过 Side / Back 提示词审阅</label>
      <button :disabled="busy||experiment.status!=='COMPILED'||!sourceReviewed" @click="confirmOpen=true">生成 Side / Back 实验图</button>
      <section v-if="confirmOpen" role="dialog" aria-label="确认 Multi-View 渲染"><p>将基于当前男孩主身份图生成两个实验视角，不会替换现有素材，也不会自动进入 Reference Pack。Side → Back 串行，各一次，不自动重试。</p>
        <button :disabled="busy" @click="render">确认生成两个实验视角</button><button :disabled="busy" @click="confirmOpen=false">取消</button></section>
      <form v-if="['COMPLETED','PARTIAL'].includes(experiment.status)" @submit.prevent="evaluate">
        <h3>人眼记录：身份 / 有效视角 / 污染</h3><p>逐项检查年龄、脸、发型、比例、服装材质与赤足；角度不必精确正交。</p>
        <label v-for="side in sides" :key="side">{{side}}<select v-model="verdicts[side]"><option value="">请选择</option><option>PASS</option><option>PARTIAL_PASS</option><option>FAIL</option></select></label>
        <textarea v-model="why" maxlength="4000" placeholder="身份、视角和污染的实际观察" /><button :disabled="busy||!verdicts.SIDE||!verdicts.BACK">保存人工记录</button>
      </form>
      <AssetIntegrityPanel :key="experiment.id" :project-id="projectId" :script-id="scriptId" :experiment-id="experiment.id" />
      <p v-if="experiment.evaluation">已记录：SIDE {{experiment.evaluation.SIDE}} / BACK {{experiment.evaluation.BACK}}</p>
      <p v-if="experiment.evaluation?.BACK==='FAIL'">Back direct 未通过，可尝试 Main + Side 双参考后视图。当前仅建议，需另行人工授权；没有 fallback 执行入口。</p>
      <p v-if="experiment.execution?.errorCode" role="alert">{{experiment.execution.errorCode}}。结果保留，不自动重新生成。</p>
    </template>
    <StudioImageLightbox v-if="lightboxImages.length" :images="lightboxImages" :index="lightboxIndex" @close="lightboxImages=[]" @change="lightboxIndex=$event" />
  </section>
</template>
<script setup lang="ts">
import {computed,ref,watch,onBeforeUnmount} from 'vue';
import axios from '@/utils/axios';
import StudioImageLightbox from './StudioImageLightbox.vue';
import AssetIntegrityPanel from './AssetIntegrityPanel.vue';
import type {StudioReviewImage} from './studioImageReview';
const props=defineProps<{projectId:number;scriptId:number}>(),sides=['SIDE','BACK'] as const;
const records=ref<any[]>([]),selectedId=ref(''),busy=ref(false),error=ref(''),confirmOpen=ref(false),sourceReviewed=ref(false);
const experiment=computed(()=>records.value.find(r=>r.id===selectedId.value));
const images=ref<Record<string,string>>({}),lightboxImages=ref<StudioReviewImage[]>([]),lightboxIndex=ref(0);
const verdicts=ref<Record<string,string>>({SIDE:'',BACK:''}),why=ref('');
let generation=0,imageGeneration=0,timer:ReturnType<typeof setTimeout>|undefined;
const scope=()=>({projectId:props.projectId,scriptId:props.scriptId});
const safeError=(e:any)=>e?.response?.data?.message||e?.message||'请求失败，请刷新检查；不会自动重试渲染。';
function releaseImages(){imageGeneration++;for(const url of Object.values(images.value))URL.revokeObjectURL(url);images.value={};lightboxImages.value=[];}
function reset(){generation++;clearTimeout(timer);records.value=[];selectedId.value='';busy.value=false;confirmOpen.value=false;sourceReviewed.value=false;error.value='';releaseImages();}
watch(()=>[props.projectId,props.scriptId],()=>{reset();void refresh();},{immediate:true});
watch(selectedId,()=>{releaseImages();sourceReviewed.value=false;confirmOpen.value=false;verdicts.value={SIDE:experiment.value?.evaluation?.SIDE||'',BACK:experiment.value?.evaluation?.BACK||''};why.value=experiment.value?.evaluation?.why||'';void loadImages();});
onBeforeUnmount(reset);
function schedule(){clearTimeout(timer);if(records.value.some(r=>r.status.startsWith('RENDERING')))timer=setTimeout(()=>void refresh(),1800);}
async function refresh(){if(busy.value)return;const token=generation;busy.value=true;try{const r:any=await axios.post('/v04/multiview/current',scope());if(token!==generation)return;records.value=r.data;if(!records.value.some(r=>r.id===selectedId.value))selectedId.value=records.value[0]?.id||'';await loadImages();schedule();}catch(e){if(token===generation)error.value=safeError(e);}finally{if(token===generation)busy.value=false;}}
async function compile(){if(busy.value)return;const token=generation;busy.value=true;error.value='';try{const r:any=await axios.post('/v04/multiview/compile',scope());if(token!==generation)return;records.value.unshift(r.data);selectedId.value=r.data.id;}catch(e){if(token===generation)error.value=safeError(e);}finally{if(token===generation)busy.value=false;}}
async function render(){if(busy.value||!confirmOpen.value||!sourceReviewed.value||experiment.value?.status!=='COMPILED')return;const token=generation,body={...scope(),experimentId:experiment.value.id,experimentHash:experiment.value.experimentHash,confirmRender:true,sourceQualityConfirmed:true};busy.value=true;error.value='';try{const r:any=await axios.post('/v04/multiview/render',body);if(token!==generation)return;records.value=records.value.map(e=>e.id===r.data.id?r.data:e);confirmOpen.value=false;schedule();}catch(e){if(token===generation){error.value=safeError(e);confirmOpen.value=false;timer=setTimeout(()=>void refresh(),100);}}finally{if(token===generation)busy.value=false;}}
async function loadImages(){const token=generation,imgToken=++imageGeneration,id=selectedId.value,s=scope(),e=experiment.value;if(!e)return;
  for(const side of ['MAIN',...sides]){if(side!=='MAIN'&&!e.execution?.[side]?.artifact)continue;if(images.value[side])continue;
    try{const blob:unknown=await axios.post('/v04/multiview/artifact',{...s,experimentId:id,side},{responseType:'blob'});if(token!==generation||imgToken!==imageGeneration||id!==selectedId.value)return;if(!(blob instanceof Blob))throw Error('MULTIVIEW_ARTIFACT_RESPONSE_INVALID');images.value={...images.value,[side]:URL.createObjectURL(blob)};}catch{if(token===generation&&id===selectedId.value)error.value='图片读取失败，可刷新重试。';}}
}
function enlarge(side:string){lightboxImages.value=['MAIN',...sides].filter(s=>images.value[s]).map(s=>({id:s,src:images.value[s]!,label:s+' · EXPERIMENTAL ONLY'}));lightboxIndex.value=Math.max(0,lightboxImages.value.findIndex(i=>i.id===side));}
async function evaluate(){if(busy.value||!experiment.value)return;const token=generation;busy.value=true;try{const r:any=await axios.post('/v04/multiview/evaluate',{...scope(),experimentId:experiment.value.id,SIDE:verdicts.value.SIDE,BACK:verdicts.value.BACK,why:why.value});if(token===generation)experiment.value.evaluation=r.data;}catch(e){if(token===generation)error.value=safeError(e);}finally{if(token===generation)busy.value=false;}}
</script>
<style scoped>
.multiview-pilot{padding:1rem;border:1px solid #596171;border-radius:8px}.views{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem}.views article{min-width:0;background:#171b22;padding:.7rem}.view-image{width:100%;height:300px}.view-image img{max-width:100%;max-height:100%;object-fit:contain}pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:50vh;overflow:auto}button{padding:.5rem .75rem;margin:.25rem;border:1px solid #596171;border-radius:5px;background:#252a35;color:inherit;cursor:pointer}button:hover{background:#353d4d}button:active{transform:translateY(1px)}button:disabled{opacity:.45;cursor:default}select,textarea{background:#202630;color:inherit;border:1px solid #626b7d;padding:.4rem}label{display:block;margin:.7rem 0}textarea{width:100%;box-sizing:border-box}[role=dialog]{border:1px solid #95804d;padding:1rem}[role=alert]{color:#ef8e8e}@media(max-width:800px){.views{grid-template-columns:1fr}}
</style>
