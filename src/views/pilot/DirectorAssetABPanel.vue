<template>
  <section class="director-ab" aria-label="Director A/B">
    <h2>Director → 鲸鱼受控视觉实验</h2>
    <p>CHAR-003 · 实验候选，不替换当前素材。先审阅语义，再手动授权受控对照图。</p>
    <button :disabled="busy" @click="compile">{{busy?'正在处理…':'编译鲸鱼 A/B 三组输入（不出图）'}}</button>
    <button :disabled="busy" @click="refresh">刷新实验记录</button>
    <p v-if="error" role="alert">{{error}}</p>
    <select v-if="records.length" v-model="selectedId" aria-label="实验记录"><option v-for="r in records" :key="r.id" :value="r.id">{{r.id.slice(0,8)}} · {{r.status}}</option></select>
    <template v-if="experiment">
      <p>Director v{{experiment.evidence.acceptedDirectorVersion}} · {{experiment.status}} · {{experiment.evidence.visualSpecSource}}</p>
      <h3>Director 为鲸鱼新增了什么？</h3><p v-if="controlled">A0 vs A1 测 Prompt 清洗；A1 vs B 测 Director 增量。三组共享完全相同执行参数。</p><p v-else>Historical Two-Way Experiment · 原 A/B 记录，不补 A1。</p>
      <div class="ab-columns" :class="{three:controlled}">
        <article v-if="controlled"><h4>A0 · LEGACY V0.4</h4><pre>{{experiment.A0.renderedPrompt}}</pre></article><article v-if="controlled"><h4>A1 · CLEAN BASE</h4><p>最终 Clean Asset Rendering Brief</p><pre>{{experiment.A1.cleanBasePrompt}}</pre></article><article v-else><h4>A · 当前非 Director 输入</h4><p>完整复用当前身份、视觉规格草案和资产执行 prompt。</p><p>不会删减 A 已有的尺度、风格或约束。</p></article>
        <article><h4>{{controlled?"B · CLEAN BASE + DIRECTOR":"B · 相同输入 + Director"}}</h4><template v-if="controlled"><h5>相同 Clean Base</h5><pre>{{experiment.B.cleanBasePrompt}}</pre><h5>Director Delta</h5><pre class="director-delta">{{experiment.B.directorDeltaPrompt}}</pre><p>A1/B cleanBaseHash：{{experiment.B.cleanBaseHash}}</p></template>
          <p>叙事功能：{{context?.narrativeRole?.narrativeFunction}}</p><p>情绪：{{context?.narrativeRole?.emotionalRead}}</p>
          <p>尺度：{{context?.narrativeRole?.scaleFunction}}</p><p v-for="r in context?.relevantScaleRelations" :key="r.smaller+r.larger">{{r.smaller}} ≪ {{r.larger}}：{{r.requirement}}</p>
          <p>观众感受：{{context?.narrativeRole?.requiredAudiencePerception?.join('；')}}</p><p>禁止误读：{{context?.narrativeRole?.forbiddenInterpretations?.join('；')}}</p>
          <section class="dna-inherited"><h5>继承的全片美术指导</h5><p v-if="!dnaLines(context?.assetVisualDNA?.inherited).length">当前已确认 Director 未配置可继承的全片 DNA；不补写示例内容。</p><p v-for="line in dnaLines(context?.assetVisualDNA?.inherited)" :key="line">{{line}}</p></section>
          <section class="dna-excluded"><h5>不应用于鲸鱼本体</h5><p v-if="!dnaLines(context?.assetVisualDNA?.excluded).length">当前全片 DNA 没有待排除条目。</p><p v-for="line in dnaLines(context?.assetVisualDNA?.excluded)" :key="line">{{line}}</p></section>
          <p v-if="context?.assetVisualDNA?.materialIdentity==='LIVING_BIOLOGICAL_CREATURE'">材质身份：真实生物体；蓝色仅作环境／照明影响，保留原有皮肤与配色。</p>
          <p>尺度参照不加入图中；鲸鱼不因全片视觉母题而被改成 Dream Matter。保持单个完整资产。</p>
        </article>
      </div>
      <section v-if="experiment.B.renderingBrief||experiment.B.directorRenderingBrief" class="rendering-brief"><h3>最终交给图片模型的 Director Rendering Brief</h3><p>{{experiment.B.renderedPrompt}}</p><p>从导演理解压缩为短视觉语言；原始剧情与 JSON 不直接交给图片模型。</p></section><p v-else>历史 raw adapter 实验；图片仍可查看，请重新编译新版输入。</p>
      <p>相同 seed {{experiment.sharedExecution.seed}} · {{experiment.sharedExecution.profile}} · {{experiment.sharedExecution.width}}×{{experiment.sharedExecution.height}}</p>
      <details><summary>查看冻结语义、prompt 与精确 workflow</summary><pre>{{JSON.stringify({A:experiment.A,A0:experiment.A0,A1:experiment.A1,B:experiment.B,evidence:experiment.evidence,sharedExecution:experiment.sharedExecution,workflows:experiment.workflows},null,2)}}</pre></details>
      <button :disabled="busy||experiment.status!=='COMPILED'" @click="confirmOpen=true">{{controlled?"生成三组对照图":"生成 A/B 对照图"}}</button>
      <div v-if="confirmOpen" role="dialog" aria-label="确认 A/B 渲染" class="render-confirm">
        <p>将生成 {{controlled?"三张":"两张"}} 实验图片，不会替换当前鲸鱼，也不会改变正式素材。{{controlled?"A0 → A1 → B":"A → B"}} 严格串行，失败不自动重试或降质。</p>
        <button :disabled="busy" @click="render">{{controlled?"确认生成三张":"确认生成两张"}}</button><button :disabled="busy" @click="confirmOpen=false">取消</button>
      </div>
      <div class="ab-columns" :class="{three:controlled}"><article v-for="side in sides" :key="side"><h4>{{side}} · {{experiment.execution?.[side]?.status||'未执行'}}</h4>
        <button v-if="images[side]" class="ab-image" @click="enlarge(side)"><img :src="images[side]" :alt="side+' 实验候选'" /></button>
        <p v-if="experiment.execution?.[side]?.errorCode">{{experiment.execution[side].errorCode}}</p></article></div>
      <p v-if="experiment.execution?.errorCode" role="alert">对照未完成：{{experiment.execution.errorCode}}。保留已有结果，不可作为有效胜负比较。</p>
      <form v-if="experiment.status==='COMPLETED'" @submit.prevent="evaluate">
        <h3>人眼评价（不自动评分）</h3><section v-if="controlled" class="hygiene-evaluation"><h4>PROMPT HYGIENE · A0 vs A1</h4><label v-for="(label,i) in hygieneDimensions" :key="label">{{label}}<select v-model="hygieneChoices[i]"><option value="">请选择</option><option>A0</option><option>A1</option><option>Same</option></select></label><label>清洗结论<select v-model="hygieneConclusion"><option value="">请选择</option><option v-for="c in hygieneConclusions" :key="c">{{c}}</option></select></label></section><h4 v-if="controlled">DIRECTOR INCREMENT · A1 vs B</h4>
        <label v-for="(label,i) in dimensions" :key="label">{{label}}<select v-model="choices[i]"><option value="">请选择</option><option>{{controlled?"A1":"A"}}</option><option>B</option><option>Same</option></select></label>
        <label>结论<select v-model="conclusion"><option value="">请选择</option><option v-for="c in conclusions" :key="c">{{c}}</option></select></label>
        <textarea v-model="why" maxlength="4000" placeholder="为什么？（可选）" />
        <button :disabled="busy||choices.some(c=>!c)||!conclusion||(controlled&&(hygieneChoices.some(c=>!c)||!hygieneConclusion))">保存人工评价</button>
        <p v-if="experiment.evaluation">已保存：{{experiment.evaluation.conclusion||experiment.evaluation.hygiene?.conclusion+" / "+experiment.evaluation.director?.conclusion}}</p>
      </form><p v-if="controlled">解释参考（不自动判胜）：A0 &lt; A1 &lt; B 为双重增益；A0 &lt; A1 ≈ B 主要是清洗收益；A0 ≈ A1 &lt; B 主要是 Director 增益；A0 &gt; A1 表示清洗损伤；A1 &gt; B 表示 Director 回归。</p>
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
const records=ref<any[]>([]),selectedId=ref(''),busy=ref(false),error=ref(''),confirmOpen=ref(false);
const images=ref<Record<string,string>>({}),lightboxImages=ref<StudioReviewImage[]>([]),lightboxIndex=ref(0);
const hygieneChoices=ref(['','','','','','']),hygieneConclusion=ref('');
const hygieneDimensions=['单资产隔离','身份清晰度','视觉完成度','画面干净程度','无关人物／动物','文字／图鉴倾向'];
const hygieneConclusions=['CLEAN_BASE_CLEAR_WIN','CLEAN_BASE_PARTIAL_WIN','CLEAN_BASE_NO_CHANGE','CLEAN_BASE_REGRESSION'];
const experiment=computed(()=>records.value.find(r=>r.id===selectedId.value)),context=computed(()=>experiment.value?.B.directorContext);
const controlled=computed(()=>experiment.value?.comparisonDesign==='LEGACY_VS_CLEAN_VS_DIRECTOR');
const sides=computed(()=>controlled.value?['A0','A1','B']:['A','B']);
function dnaLines(value:any):string[]{if(!value)return [];const labels:Record<string,string>={artStyle:'美术风格',colorLanguage:'环境色彩',lightingLanguage:'照明',realismLevel:'写实程度',atmosphere:'氛围',forbiddenStyleDrift:'风格边界',materialLanguage:'材质语言',motionLanguage:'运动语言',recurringVisualMotifs:'视觉母题'};return Object.entries(value).flatMap(([key,v])=>(Array.isArray(v)?v:v?[v]:[]).map(line=>`${labels[key]||key}：${line}`));}
const dimensions=['巨物尺度感（较好者）','敬畏感（较好者）','是否过于可爱（较差者）','是否误变成怪兽（较差者）','是否符合故事鲸鱼（较好者）','整体美术契合（较好者）'];
const conclusions=['CLEAR_WIN','PARTIAL_WIN','NO_IMPROVEMENT','REGRESSION'];
const choices=ref(['','','','','','']),conclusion=ref(''),why=ref('');
let generation=0,imageGeneration=0,imageExperiment='',timer:ReturnType<typeof setTimeout>|undefined;
const scope=()=>({projectId:props.projectId,scriptId:props.scriptId});
function releaseImages(){imageGeneration++;imageExperiment='';for(const url of Object.values(images.value))URL.revokeObjectURL(url);images.value={};lightboxImages.value=[];}
function reset(){generation++;clearTimeout(timer);busy.value=false;records.value=[];selectedId.value='';confirmOpen.value=false;error.value='';releaseImages();choices.value=['','','','','',''];conclusion.value='';hygieneChoices.value=['','','','','',''];hygieneConclusion.value='';why.value='';}
watch(()=>[props.projectId,props.scriptId],()=>{reset();void refresh();},{immediate:true});
watch(selectedId,()=>{releaseImages();const evaluation=experiment.value?.evaluation;hygieneChoices.value=evaluation?.hygiene?.choices?[...evaluation.hygiene.choices]:['','','','','',''];hygieneConclusion.value=evaluation?.hygiene?.conclusion||'';const e=evaluation?.director||evaluation;choices.value=e?.choices?[...e.choices]:['','','','','',''];conclusion.value=e?.conclusion||'';why.value=e?.why||'';confirmOpen.value=false;void loadImages();});
onBeforeUnmount(reset);
function schedule(){clearTimeout(timer);if(records.value.some(r=>r.status.startsWith('RENDERING')))timer=setTimeout(()=>void refresh(),1800);}
function safeError(e:any){return e?.response?.data?.message||e?.message||'请求失败，请刷新检查状态；渲染不会自动重试。';}
async function refresh(){if(busy.value)return;const token=generation;busy.value=true;try{const r:any=await axios.post('/v04/director/asset-ab/current',scope());if(token!==generation)return;records.value=r.data;if(!records.value.some(r=>r.id===selectedId.value))selectedId.value=records.value[0]?.id||'';await loadImages();schedule();}catch(e){if(token===generation)error.value=safeError(e);}finally{if(token===generation)busy.value=false;}}
async function compile(){if(busy.value)return;const token=generation;busy.value=true;error.value='';try{const r:any=await axios.post('/v04/director/asset-ab/compile',scope());if(token!==generation)return;records.value.unshift(r.data);selectedId.value=r.data.id;releaseImages();}catch(e){if(token===generation)error.value=safeError(e);}finally{if(token===generation)busy.value=false;}}
async function render(){if(busy.value||!confirmOpen.value||experiment.value?.status!=='COMPILED')return;const token=generation,body={...scope(),experimentId:experiment.value.id,pairHash:experiment.value.pairHash,confirmRender:true};busy.value=true;error.value='';try{const r:any=await axios.post('/v04/director/asset-ab/render',body);if(token!==generation)return;records.value=records.value.map(e=>e.id===r.data.id?r.data:e);confirmOpen.value=false;schedule();}catch(e){if(token===generation){error.value=safeError(e);confirmOpen.value=false;timer=setTimeout(()=>void refresh(),100);}}finally{if(token===generation)busy.value=false;}}
async function loadImages(){const token=generation,imgToken=++imageGeneration,id=selectedId.value,s=scope(),e=experiment.value;if(!e)return;
  for(const side of sides.value){if(!e.execution?.[side]?.artifact)continue;if(images.value[side]&&imageExperiment===id)continue;
    try{const blob:unknown=await axios.post('/v04/director/asset-ab/artifact',{...s,experimentId:id,side},{responseType:'blob'});if(token!==generation||imgToken!==imageGeneration||id!==selectedId.value)return;if(!(blob instanceof Blob))throw new Error('DIRECTOR_AB_ARTIFACT_RESPONSE_INVALID');const url=URL.createObjectURL(blob);if(images.value[side])URL.revokeObjectURL(images.value[side]);imageExperiment=id;images.value={...images.value,[side]:url};}catch{if(token===generation)error.value='实验图片读取失败，可刷新重试。';}}
}
function enlarge(side:string){lightboxImages.value=sides.value.filter(s=>images.value[s]).map(s=>({id:s,src:images.value[s]!,label:s+' · EXPERIMENTAL_CANDIDATE'}));lightboxIndex.value=Math.max(0,lightboxImages.value.findIndex(i=>i.id===side));}
async function evaluate(){if(busy.value||!experiment.value)return;const token=generation;busy.value=true;try{const r:any=await axios.post('/v04/director/asset-ab/evaluate',{...scope(),experimentId:experiment.value.id,...(controlled.value?{hygiene:{choices:hygieneChoices.value,conclusion:hygieneConclusion.value},director:{choices:choices.value,conclusion:conclusion.value}}:{choices:choices.value,conclusion:conclusion.value}),why:why.value});if(token===generation)experiment.value.evaluation=r.data;}catch(e){if(token===generation)error.value=safeError(e);}finally{if(token===generation)busy.value=false;}}
</script>
<style scoped>
.director-ab{margin-top:1rem;border:1px solid var(--td-component-border);padding:1rem;border-radius:8px}.ab-columns{display:grid;grid-template-columns:1fr 1fr;gap:1rem}.ab-columns.three{grid-template-columns:repeat(3,minmax(0,1fr))}.ab-columns article{min-width:0;padding:.7rem;background:#171b22}.ab-image{width:100%;height:320px;background:#13161c}.ab-image img{max-width:100%;max-height:100%;object-fit:contain}pre{max-height:50vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}button{padding:.5rem .75rem;margin:.25rem;border:1px solid #596171;border-radius:5px;background:#252a35;color:inherit;cursor:pointer}button:hover{background:#353d4d}button:active{transform:translateY(1px)}button:disabled{opacity:.45;cursor:default}label{display:flex;justify-content:space-between;gap:1rem;padding:.4rem}select,textarea{background:#202630;color:inherit;border:1px solid #626b7d;padding:.4rem}textarea{width:100%;box-sizing:border-box}.render-confirm{padding:1rem;border:1px solid #95804d}[role=alert]{color:#ef8e8e}@media(max-width:700px){.ab-columns,.ab-columns.three{grid-template-columns:1fr}}
</style>
