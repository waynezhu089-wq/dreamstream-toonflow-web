<template>
  <section class="operations" aria-label="Professional Operations">
    <div class="toolbar"><h2>Operations · EXPERIMENTAL</h2><button :disabled="busy" @click="load">刷新 / 测试 Comfy</button></div>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <nav><button v-for="key in ['Status','Routing','Workflows','Executions']" :key="key" :class="{active:tab===key}" @click="tab=key">{{ key }}</button></nav>
    <template v-if="status">
      <div v-if="tab==='Status'">
        <h3>System status</h3><dl><dt>Frontend</dt><dd>ONLINE · {{ frontendCommit || 'UNKNOWN build commit' }}</dd><dt>Backend</dt><dd>{{ status.backend.status }} · {{ status.backend.commit || 'UNKNOWN' }}</dd><dt>数据环境</dt><dd>{{ status.backend.dataDirectory }}</dd><dt>Stable</dt><dd>PROTECTED</dd><dt>Comfy</dt><dd>{{ status.comfy.status }} · {{ status.comfy.baseUrl }} · version {{ status.comfy.version || 'UNKNOWN' }}</dd></dl>
        <h4>实际设备 / queue（不是 peak VRAM）</h4><pre>{{ pretty({devices:status.comfy.devices,queue:status.comfy.queue}) }}</pre>
        <h4>Automatic Asset Coverage</h4><pre>{{ pretty(coverage) }}</pre><h4>Legacy Draft Executor Config</h4><pre>{{ pretty(status.legacyConfig) }}</pre><p>这是旧草图配置，与 Agent Image Edit Routing 分开。</p>
      </div>
      <div v-if="tab==='Routing'">
        <h3>Active image routing · THIS PROJECT</h3>
        <div v-for="(profile,task) in status.routing.routes" :key="task" class="route-row"><strong>{{ task }}</strong><span>{{ profile }}</span><small>{{ registryItem(profile)?.wiring }}</small><select v-model="routes[String(task)]" @change="plan=null"><option v-for="p in compatible(String(task))" :key="p.profile" :value="p.profile">{{ p.profile }}</option></select></div>
        <p>Z-Image / LOCAL_DRAFT_V1: MANUAL / LEGACY（见独立旧配置）</p>
        <label v-for="p in status.registry.filter((p:any)=>p.wiring!=='MANUAL_LEGACY')" :key="p.profile" class="disable"><input v-model="disabled" type="checkbox" :value="p.profile" @change="plan=null" />禁用新 {{ p.profile }} 准入</label>
        <p>不终止已提交任务。T2I 仍 NOT WIRED；切换配置不会接通尚未实现的路线。</p>
        <p>Changed by {{ status.routing.changedBy ?? 'DEFAULT' }} · {{ time(status.routing.changedAt) }}</p>
        <button :disabled="busy" @click="preview(false)">Preview routing</button><button :disabled="busy" @click="preview(true)">Reset project routing to default · Preview</button>
        <div v-if="plan" class="preview"><h4>待确认的项目级变更</h4><pre>{{ pretty({current:plan.current,proposed:plan.proposed,affectedTaskTypes:plan.affectedTaskTypes,scope:plan.scope}) }}</pre><label><input v-model="confirmed" type="checkbox" />我确认上述项目级路由变更</label><button :disabled="busy || !confirmed" @click="apply">Confirm → Apply</button><button @click="plan=null">取消</button></div>
      </div>
      <div v-if="tab==='Workflows'">
        <button v-for="p in status.registry" :key="p.profile" class="profile" @click="inspectProfile(p)">{{ p.profile }} · {{ p.health }} · {{ p.wiring }}</button>
        <template v-if="profileDetail"><h3>{{ profileDetail.profile }}</h3><p>JSON FILE: NONE — runtime generated</p><pre>{{ pretty(profileDetail) }}</pre><button :disabled="busy" @click="example">查看 Example Graph（不执行）</button></template>
      </div>
      <div v-if="tab==='Executions'">
        <h3>Recent executions · 最近 50 条（历史 graph 不重建）</h3><select v-model="filter" @change="loadHistory"><option v-for="f in ['All','Running','Failed','Krea','ZImage','Asset']" :key="f">{{ f }}</option></select><input v-if="filter==='Asset'" v-model="assetFilter" placeholder="canonicalKey，如 CHAR-001" @change="loadHistory" />
        <table><thead><tr><th>Time</th><th>Asset / Action</th><th>Profile</th><th>Status</th><th>Duration</th></tr></thead><tbody><tr v-for="row in rows" :key="row.id" tabindex="0" @click="openTrace(row)" @keydown.enter="openTrace(row)"><td>{{ time(row.createdAt) }}</td><td>{{ row.canonicalKey }} / {{ row.executionPurpose }}</td><td>{{ row.executorProfile }}</td><td>{{ row.status }}</td><td>{{ duration(row) }}</td></tr></tbody></table>
        <p v-if="!rows.length">暂无被本版本捕获的提交。旧任务不会伪造 graph。</p>
        <div v-if="detail"><h3>{{ detail.canonicalKey }} · {{ detail.status }}</h3><pre>{{ pretty(detailSummary) }}</pre><button @click="showActualGraph">查看实际 JSON</button><div v-if="outputImages.length" class="outputs"><img v-for="image in outputImages" :key="image" :src="image" alt="任务实际输出" /></div><p>技术错误：{{ detail.errorCode || 'NONE' }}；{{ detail.errorDetail || '' }}</p></div>
      </div>
      <div v-if="graph!==null" class="graph-viewer"><h3>{{ graphTitle }}</h3><input v-model="search" placeholder="搜索节点 / JSON" /><button @click="copyGraph">复制 JSON</button><button @click="downloadGraph">下载 JSON</button><button @click="graph=null">关闭</button><pre>{{ displayedGraph }}</pre></div>
    </template>
  </section>
</template>
<script setup lang="ts">
import {computed,onBeforeUnmount,ref,watch} from 'vue';
import axios from '@/utils/axios';
const props=defineProps<{projectId:number;scriptId:number}>();
const frontendCommit=(import.meta as any).env.VITE_EXPERIMENTAL_COMMIT ?? null;
const status=ref<any>(null),tab=ref('Status'),busy=ref(false),error=ref(''),routes=ref<Record<string,string>>({}),disabled=ref<string[]>([]),plan=ref<any>(null),confirmed=ref(false);
const rows=ref<any[]>([]),filter=ref('All'),assetFilter=ref(''),detail=ref<any>(null),profileDetail=ref<any>(null),graph=ref<string|null>(null),graphTitle=ref(''),search=ref(''),outputImages=ref<string[]>([]);
let generation=0,historyGeneration=0,detailGeneration=0;const urls:string[]=[];
const pretty=(v:any)=>JSON.stringify(v,null,2),time=(v:any)=>v?new Date(Number(v)).toLocaleString():'—';
const duration=(v:any)=>v.submittedAt&&v.completedAt?`${((v.completedAt-v.submittedAt)/1000).toFixed(1)} s`:'—';
const coverage=ref<any>(null);
const registryItem=(id:string)=>status.value?.registry.find((p:any)=>p.profile===id);
const compatible=(task:string)=>status.value?.registry.filter((p:any)=>p.capabilities.includes(task))??[];
const displayedGraph=computed(()=>{if(!search.value)return graph.value;const parsed=JSON.parse(graph.value||'{}');return pretty(Object.fromEntries(Object.entries(parsed).filter(([key,node])=>`${key} ${JSON.stringify(node)}`.toLowerCase().includes(search.value.toLowerCase()))));});
const detailSummary=computed(()=>{if(!detail.value)return null;const {workflowGraphJson,...rest}=detail.value;return {...rest,parameters:JSON.parse(rest.parametersJson),models:JSON.parse(rest.modelsJson),sources:JSON.parse(rest.sourcesJson),references:JSON.parse(rest.referencesJson)};});
function revoke(){urls.splice(0).forEach(url=>URL.revokeObjectURL(url));outputImages.value=[];}
async function request(path:string,body:any){return (await axios.post('/v04/operations/'+path,body)).data;}
async function load(){const token=generation,projectId=props.projectId;busy.value=true;error.value='';try{const result=await request('status',{projectId});if(token!==generation)return;status.value=result;routes.value={...result.routing.routes};disabled.value=[...result.routing.disabledProfiles];await loadHistory();try{const value:any=await axios.post('/v04/studio/auto-assets/coverage',{projectId,scriptId:props.scriptId});if(token===generation)coverage.value=value.data;}catch{if(token===generation)coverage.value={status:'UNKNOWN'};}}catch(e:any){if(token===generation)error.value=e.response?.data?.message||'后台状态读取失败';}finally{if(token===generation)busy.value=false;}}
async function loadHistory(){const token=generation,historyToken=++historyGeneration;try{const result=await request('executions',{projectId:props.projectId,filter:filter.value,...(filter.value==='Asset'&&assetFilter.value?{canonicalKey:assetFilter.value}:{})});if(token===generation&&historyToken===historyGeneration)rows.value=result;}catch{if(token===generation&&historyToken===historyGeneration)error.value='执行历史读取失败';}}
async function preview(reset:boolean){const token=generation;busy.value=true;try{const result=await request('routing/preview',{projectId:props.projectId,requestId:crypto.randomUUID(),reset,routes:reset?{}:routes.value,disabledProfiles:reset?[]:disabled.value});if(token===generation){plan.value=result;confirmed.value=false;}}catch(e:any){if(token===generation)error.value=e.response?.data?.message||'路由预览失败';}finally{if(token===generation)busy.value=false;}}
async function apply(){if(!plan.value||!confirmed.value||busy.value)return;const token=generation;busy.value=true;try{await request('routing/apply',{...plan.value.request,previewHash:plan.value.previewHash,confirmed:true});if(token!==generation)return;plan.value=null;await load();}catch(e:any){if(token===generation)error.value=e.response?.data?.message||'应用结果未确认；保留原请求，核对后可重试';}finally{if(token===generation)busy.value=false;}}
function inspectProfile(p:any){profileDetail.value=p;graph.value=null;}
async function example(){const token=generation,p=profileDetail.value;try{const result=await request('workflow/example',{projectId:props.projectId,profile:p.profile});if(token===generation&&profileDetail.value===p){graph.value=pretty(result.graph);graphTitle.value='Example only — Comfy API graph';search.value='';}}catch{if(token===generation)error.value='示例读取失败';}}
async function openTrace(row:any){const token=generation,detailToken=++detailGeneration,projectId=props.projectId;revoke();graph.value=null;detail.value=null;try{const result=await request('execution',{projectId,traceId:row.id});if(token!==generation||detailToken!==detailGeneration)return;detail.value=result;const images=await Promise.all(JSON.parse(result.outputArtifactIdsJson).map(async(id:string)=>{const blob=await axios.get(`/v04/studio/artifact/${projectId}/${id}`,{responseType:'blob'});return URL.createObjectURL(blob as unknown as Blob);}));if(token!==generation||detailToken!==detailGeneration){images.forEach(URL.revokeObjectURL);return;}urls.push(...images);outputImages.value=images;}catch{if(token===generation&&detailToken===detailGeneration)error.value='任务详情或输出读取失败';}}
function showActualGraph(){graph.value=pretty(JSON.parse(detail.value.workflowGraphJson));graphTitle.value='Actual submitted Comfy API graph';search.value='';}
async function copyGraph(){try{await navigator.clipboard.writeText(graph.value||'');}catch{error.value='无法复制，请下载 JSON';}}
function downloadGraph(){const actual=graphTitle.value.startsWith('Actual'),content=actual?detail.value.workflowGraphJson:graph.value;const url=URL.createObjectURL(new Blob([content||''],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=actual?'actual-comfy-graph.json':'example-comfy-graph.json';a.click();URL.revokeObjectURL(url);}
watch(()=>[props.projectId,props.scriptId],()=>{generation++;status.value=null;plan.value=null;detail.value=null;profileDetail.value=null;graph.value=null;rows.value=[];revoke();void load();},{immediate:true});
onBeforeUnmount(()=>{generation++;revoke();});
</script>
<style scoped>
.operations{max-width:1100px;min-width:0;color:var(--td-text-color-primary);padding:16px;background:var(--td-bg-color-container)}.toolbar,nav,.route-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}nav{margin:16px 0}button,select,input{color:inherit;background:var(--td-bg-color-secondarycontainer);border:1px solid var(--td-component-border);border-radius:5px;padding:7px}button{cursor:pointer}button:hover,.active{border-color:var(--td-brand-color)}button:disabled{opacity:.5;cursor:default}pre{white-space:pre-wrap;overflow:auto;max-height:420px;background:var(--td-bg-color-secondarycontainer);padding:12px;word-break:break-word}dl{display:grid;grid-template-columns:110px 1fr;gap:10px}dd{margin:0;overflow-wrap:anywhere}.route-row{padding:10px 0;border-bottom:1px solid var(--td-component-border)}.disable,.profile{display:block;margin:8px 0}.preview,.graph-viewer{margin-top:20px;border:1px solid var(--td-component-border);padding:15px}table{width:100%;text-align:left;font-size:12px}td,th{padding:8px;border-bottom:1px solid var(--td-component-border)}tbody tr{cursor:pointer}tbody tr:hover{background:var(--td-bg-color-secondarycontainer)}.error{color:var(--td-error-color)}.outputs img{max-width:280px;max-height:280px;object-fit:contain}
</style>
