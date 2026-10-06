<template>
  <section class="director-ab" aria-label="Director A/B">
    <h2>Director → 鲸鱼设计 A/B</h2>
    <p>CHAR-003 · 实验候选，不替换当前素材。先审阅语义，再手动授权两张对照图。</p>
    <button :disabled="busy" @click="compile">{{busy?'正在处理…':'编译鲸鱼 A/B 输入（不出图）'}}</button>
    <button :disabled="busy" @click="refresh">刷新实验记录</button>
    <p v-if="error" role="alert">{{error}}</p>
    <select v-if="records.length" v-model="selectedId" aria-label="实验记录"><option v-for="r in records" :key="r.id" :value="r.id">{{r.id.slice(0,8)}} · {{r.status}}</option></select>
    <template v-if="experiment">
      <p>Director v{{experiment.evidence.acceptedDirectorVersion}} · {{experiment.status}} · {{experiment.evidence.visualSpecSource}}</p>
      <h3>Director 为鲸鱼新增了什么？</h3>
      <div class="ab-columns">
        <article><h4>A · 当前非 Director 输入</h4><p>完整复用当前身份、视觉规格草案和资产执行 prompt。</p><p>不会删减 A 已有的尺度、风格或约束。</p></article>
        <article><h4>B · 相同输入 + Director</h4>
          <p>叙事功能：{{context?.narrativeRole?.narrativeFunction}}</p><p>情绪：{{context?.narrativeRole?.emotionalRead}}</p>
          <p>尺度：{{context?.narrativeRole?.scaleFunction}}</p><p v-for="r in context?.relevantScaleRelations" :key="r.smaller+r.larger">{{r.smaller}} ≪ {{r.larger}}：{{r.requirement}}</p>
          <p>观众感受：{{context?.narrativeRole?.requiredAudiencePerception?.join('；')}}</p><p>禁止误读：{{context?.narrativeRole?.forbiddenInterpretations?.join('；')}}</p>
          <section class="dna-inherited"><h5>继承的全片美术指导</h5><p v-if="!dnaLines(context?.assetVisualDNA?.inherited).length">当前已确认 Director 未配置可继承的全片 DNA；不补写示例内容。</p><p v-for="line in dnaLines(context?.assetVisualDNA?.inherited)" :key="line">{{line}}</p></section>
          <section class="dna-excluded"><h5>不应用于鲸鱼本体</h5><p v-if="!dnaLines(context?.assetVisualDNA?.excluded).length">当前全片 DNA 没有待排除条目。</p><p v-for="line in dnaLines(context?.assetVisualDNA?.excluded)" :key="line">{{line}}</p></section>
          <p v-if="context?.assetVisualDNA?.materialIdentity==='LIVING_BIOLOGICAL_CREATURE'">材质身份：真实生物体；蓝色仅作环境／照明影响，保留原有皮肤与配色。</p>
          <p>尺度参照不加入图中；鲸鱼不因全片视觉母题而被改成 Dream Matter。保持单个完整资产。</p>
        </article>
      </div>
      <p>相同 seed {{experiment.sharedExecution.seed}} · {{experiment.sharedExecution.profile}} · {{experiment.sharedExecution.width}}×{{experiment.sharedExecution.height}}</p>
      <details><summary>查看冻结语义、prompt 与精确 workflow</summary><pre>{{JSON.stringify({A:experiment.A,B:experiment.B,evidence:experiment.evidence,sharedExecution:experiment.sharedExecution,workflows:experiment.workflows},null,2)}}</pre></details>
      <button :disabled="busy||experiment.status!=='COMPILED'" @click="confirmOpen=true">生成 A/B 对照图</button>
      <div v-if="confirmOpen" role="dialog" aria-label="确认 A/B 渲染" class="render-confirm">
        <p>将生成两张实验图片，不会替换当前鲸鱼，也不会改变正式素材。A 后 B，失败不自动重试或降质。</p>
        <button :disabled="busy" @click="render">确认生成两张</button><button :disabled="busy" @click="confirmOpen=false">取消</button>
      </div>
      <div class="ab-columns"><article v-for="side in sides" :key="side"><h4>{{side}} · {{experiment.execution?.[side]?.status||'未执行'}}</h4>
        <button v-if="images[side]" class="ab-image" @click="enlarge(side)"><img :src="images[side]" :alt="side+' 实验候选'" /></button>
        <p v-if="experiment.execution?.[side]?.errorCode">{{experiment.execution[side].errorCode}}</p></article></div>
      <p v-if="experiment.execution?.errorCode" role="alert">对照未完成：{{experiment.execution.errorCode}}。保留已有结果，不可作为有效胜负比较。</p>
      <form v-if="experiment.status==='COMPLETED'" @submit.prevent="evaluate">
        <h3>人眼评价（不自动评分）</h3>
        <label v-for="(label,i) in dimensions" :key="label">{{label}}<select v-model="choices[i]"><option value="">请选择</option><option>A</option><option>B</option><option>Same</option></select></label>
        <label>结论<select v-model="conclusion"><option value="">请选择</option><option v-for="c in conclusions" :key="c">{{c}}</option></select></label>
        <textarea v-model="why" maxlength="4000" placeholder="为什么？（可选）" />
        <button :disabled="busy||choices.some(c=>!c)||!conclusion">保存人工评价</button>
        <p v-if="experiment.evaluation">已保存：{{experiment.evaluation.conclusion}}</p>
      </form>
    </template>
    <StudioImageLightbox v-if="lightboxImages.length" :images="lightboxImages" :index="lightboxIndex" @close="lightboxImages=[]" @change="lightboxIndex=$event" />
  </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import axios from '@/utils/axios';
import StudioImageLightbox from './StudioImageLightbox.vue';
import type {StudioReviewImage} from './studioImageReview';
const props=defineProps<{projectId:number;scriptId:number}>();
const sides=['A','B'] as const,records=ref<any[]>([]),selectedId=ref(''),busy=ref(false),error=ref(''),confirmOpen=ref(false);
const images=ref<Record<string,string>>({}),lightboxImages=ref<StudioReviewImage[]>([]),lightboxIndex=ref(0);
const experiment=computed(()=>records.value.find(r=>r.id===selectedId.value)),context=computed(()=>experiment.value?.B.directorContext);
function dnaLines(value:any):string[]{if(!value)return [];const labels:Record<string,string>={artStyle:'美术风格',colorLanguage:'环境色彩',lightingLanguage:'照明',realismLevel:'写实程度',atmosphere:'氛围',forbiddenStyleDrift:'风格边界',materialLanguage:'材质语言',motionLanguage:'运动语言',recurringVisualMotifs:'视觉母题'};return Object.entries(value).flatMap(([key,v])=>(Array.isArray(v)?v:v?[v]:[]).map(line=>`${labels[key]||key}：${line}`));}
const dimensions=['巨物尺度感（较好者）','敬畏感（较好者）','是否过于可爱（较差者）','是否误变成怪兽（较差者）','是否符合故事鲸鱼（较好者）','整体美术契合（较好者）'];
const conclusions=['CLEAR_WIN','PARTIAL_WIN','NO_IMPROVEMENT','REGRESSION'];
const choices=ref(['','','','','','']),conclusion=ref(''),why=ref('');
let generation=0,imageGeneration=0,imageExperiment='',timer:ReturnType<typeof setTimeout>|undefined;
const scope=()=>({projectId:props.projectId,scriptId:props.scriptId});
function releaseImages(){imageGeneration++;imageExperiment='';for(const url of Object.values(images.value))URL.revokeObjectURL(url);images.value={};lightboxImages.value=[];}
function reset(){generation++;clearTimeout(timer);busy.value=false;records.value=[];selectedId.value='';confirmOpen.value=false;error.value='';releaseImages();choices.value=['','','','','',''];conclusion.value='';why.value='';}
watch(()=>[props.projectId,props.scriptId],()=>{reset();void refresh();},{immediate:true});
watch(selectedId,()=>{releaseImages();const e=experiment.value?.evaluation;choices.value=e?.choices?[...e.choices]:['','','','','',''];conclusion.value=e?.conclusion||'';why.value=e?.why||'';confirmOpen.value=false;void loadImages();});
onBeforeUnmount(reset);
function schedule(){clearTimeout(timer);if(records.value.some(r=>r.status.startsWith('RENDERING')))timer=setTimeout(()=>void refresh(),1800);}
function safeError(e:any){return e?.response?.data?.message||e?.message||'请求失败，请刷新检查状态；渲染不会自动重试。';}
async function refresh(){if(busy.value)return;const token=generation;busy.value=true;try{const r:any=await axios.post('/v04/director/asset-ab/current',scope());if(token!==generation)return;records.value=r.data;if(!records.value.some(r=>r.id===selectedId.value))selectedId.value=records.value[0]?.id||'';await loadImages();schedule();}catch(e){if(token===generation)error.value=safeError(e);}finally{if(token===generation)busy.value=false;}}
async function compile(){if(busy.value)return;const token=generation;busy.value=true;error.value='';try{const r:any=await axios.post('/v04/director/asset-ab/compile',scope());if(token!==generation)return;records.value.unshift(r.data);selectedId.value=r.data.id;releaseImages();}catch(e){if(token===generation)error.value=safeError(e);}finally{if(token===generation)busy.value=false;}}
async function render(){if(busy.value||!confirmOpen.value||experiment.value?.status!=='COMPILED')return;const token=generation,body={...scope(),experimentId:experiment.value.id,pairHash:experiment.value.pairHash,confirmRender:true};busy.value=true;error.value='';try{const r:any=await axios.post('/v04/director/asset-ab/render',body);if(token!==generation)return;records.value=records.value.map(e=>e.id===r.data.id?r.data:e);confirmOpen.value=false;schedule();}catch(e){if(token===generation){error.value=safeError(e);confirmOpen.value=false;timer=setTimeout(()=>void refresh(),100);}}finally{if(token===generation)busy.value=false;}}
async function loadImages(){const token=generation,imgToken=++imageGeneration,id=selectedId.value,s=scope(),e=experiment.value;if(!e)return;
  for(const side of sides){if(!e.execution?.[side]?.artifact)continue;if(images.value[side]&&imageExperiment===id)continue;
    try{const blob:unknown=await axios.post('/v04/director/asset-ab/artifact',{...s,experimentId:id,side},{responseType:'blob'});if(token!==generation||imgToken!==imageGeneration||id!==selectedId.value)return;if(!(blob instanceof Blob))throw new Error('DIRECTOR_AB_ARTIFACT_RESPONSE_INVALID');const url=URL.createObjectURL(blob);if(images.value[side])URL.revokeObjectURL(images.value[side]);imageExperiment=id;images.value={...images.value,[side]:url};}catch{if(token===generation)error.value='实验图片读取失败，可刷新重试。';}}
}
function enlarge(side:'A'|'B'){lightboxImages.value=sides.filter(s=>images.value[s]).map(s=>({id:s,src:images.value[s]!,label:s+' · EXPERIMENTAL_CANDIDATE'}));lightboxIndex.value=Math.max(0,lightboxImages.value.findIndex(i=>i.id===side));}
async function evaluate(){if(busy.value||!experiment.value)return;const token=generation;busy.value=true;try{const r:any=await axios.post('/v04/director/asset-ab/evaluate',{...scope(),experimentId:experiment.value.id,choices:choices.value,conclusion:conclusion.value,why:why.value});if(token===generation)experiment.value.evaluation=r.data;}catch(e){if(token===generation)error.value=safeError(e);}finally{if(token===generation)busy.value=false;}}
</script>
<style scoped>
.director-ab{margin-top:1rem;border:1px solid var(--td-component-border);padding:1rem;border-radius:8px}.ab-columns{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.ab-columns article{min-width:0;padding:.7rem;background:#171b22}.ab-image{width:100%;height:320px;background:#13161c}.ab-image img{max-width:100%;max-height:100%;object-fit:contain}pre{max-height:50vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}button{padding:.5rem .75rem;margin:.25rem;border:1px solid #596171;border-radius:5px;background:#252a35;color:inherit;cursor:pointer}button:hover{background:#353d4d}button:active{transform:translateY(1px)}button:disabled{opacity:.45;cursor:default}label{display:flex;justify-content:space-between;gap:1rem;padding:.4rem}select,textarea{background:#202630;color:inherit;border:1px solid #626b7d;padding:.4rem}textarea{width:100%;box-sizing:border-box}.render-confirm{padding:1rem;border:1px solid #95804d}[role=alert]{color:#ef8e8e}@media(max-width:700px){.ab-columns{grid-template-columns:1fr}}
</style>
