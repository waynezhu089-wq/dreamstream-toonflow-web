<template>
 <section class="integrity-panel"><h3>Professional QA / debugging · Integrity Gate</h3><p>人工检查，不是自动视觉判定。不可见不等于缺失；已确认的虚构结构优先。不评价氛围或导演意图。</p>
 <button :disabled="busy" @click="load">刷新检查记录</button><p v-if="error" role="alert">{{error}}</p>
 <template v-if="state"><p>Resolved Profile: {{state.context.integrityProfile}} · HUMAN_INSPECTOR</p>
 <section class="quality-pipeline"><h4>Generation Quality Pipeline · SHADOW</h4><p>本地 Fast Vision：UNAVAILABLE。元数据合格不代表视觉结构合格。</p>
 <button :disabled="busy" @click="quality('fast')">运行 Fast Gate（不调用外部 API）</button>
 <label v-if="canEscalate"><input v-model="externalConfirmed" type="checkbox" /> 允许将该实验 MAIN/SIDE/BACK 发送到项目配置的 Vision，仅影子检查</label>
 <button v-if="canEscalate" :disabled="busy||!externalConfirmed" @click="quality('vision')">Vision 影子检查</button>
 <article v-for="record in pipelineRecords" :key="record.id"><p>{{record.freshness}} · Guard {{record.pipeline.guardState}} · Vision {{record.pipeline.visionEscalation}} · {{record.pipeline.phase}}</p>
 <p v-for="view in ['SIDE','BACK']" :key="view">{{view}} Fast: {{record.pipeline.fast[view].status}} → {{record.pipeline.decisions[view]}}</p><p>CROSS-VIEW: {{record.pipeline.decisions.CROSS_VIEW}}</p>
 <details><summary>checks / issues / hashes / latency / model / repair proposals</summary><pre>{{JSON.stringify({pipeline:record.pipeline,reports:record.reports,repairProposals:record.repairProposals},null,2)}}</pre></details>
 <div v-if="record.pipeline.kind==='VISION'&&record.pipeline.phase==='COMPLETED'&&record.freshness==='CURRENT'"><button v-for="choice in ['USEFUL','PARTIALLY_USEFUL','WRONG']" :key="choice" :disabled="busy" @click="feedback(record.id,choice)">{{choice==='USEFUL'?'有用':choice==='PARTIALLY_USEFUL'?'部分有用':'不准确'}}</button></div><p v-if="record.pipeline.humanFeedback">人工反馈：{{record.pipeline.humanFeedback}}</p>
 <p v-if="record.pipeline.phase==='STARTED'">外部交付结果尚不确定；刷新记录，不自动重复调用。</p></article></section>
 <small v-if="state.context.profileResolution">{{state.context.profileResolution.confidence}} · 依据：{{state.context.profileResolution.evidence.join('；')}}<span v-if="state.context.profileResolution.fallbackUsed"> · 通用/辅助依据，请人工核对形态</span></small>
 <p v-if="!state.input">图片未完成或来源已变化，只能查看历史。</p>
 <details><summary>确认身份 / 结构依据</summary><pre>{{JSON.stringify(state.context,null,2)}}</pre></details>
 <form v-if="state.input" @submit.prevent="save"><article v-for="view in views" :key="view"><h4>{{view}}</h4>
 <label><input v-model="reports[view].reviewed" type="checkbox" /> 已实际检查{{view==='CROSS_VIEW'?'三视图连续性':'该视图结构'}}</label>
 <label v-for="field in fields" :key="field.key">{{field.label}}<select v-model="reports[view][field.key]"><option value="UNKNOWN">尚不能判断</option><option value="PASS">可接受</option><option value="FAIL">整体不符合</option></select></label>
 <div v-for="(issue,index) in reports[view].issues" :key="issue.id" class="issue">
 <label>哪里有问题？<select v-model="issue.affectedRegion"><option v-for="region in regions" :key="region">{{region}}</option></select></label>
 <label>问题类型<select v-model="issue.category"><option v-for="category in view==='CROSS_VIEW'?['CROSS_VIEW']:categories" :key="category">{{category}}</option></select></label>
 <label>程度<select v-model="issue.severity"><option value="MINOR">轻微</option><option value="MODERATE">明显但可修</option><option value="MAJOR">整体错误</option></select></label>
 <label>把握<select v-model="issue.confidence"><option value="LOW">不确定</option><option value="MEDIUM">中等</option><option value="HIGH">明确</option></select></label>
 <label><input v-model="issue.localizable" type="checkbox" /> 能定位问题区域</label>
 <label>建议<select v-model="issue.repairability"><option value="LOCAL_REPAIR">局部修复</option><option value="REGION_REPAIR">区域修复</option><option value="REGENERATE_VIEW">重做该视图</option><option value="HUMAN_REVIEW">待进一步判断</option></select></label>
 <textarea v-model="issue.description" maxlength="1000" placeholder="实际看到的问题；不要把遮挡直接当缺失" required /><button type="button" @click="reports[view].issues.splice(index,1)">移除此项</button>
 </div><button type="button" @click="add(view)">添加 {{view}} 问题</button></article>
 <button :disabled="busy||!state.input">保存人工检查 / 生成修复建议</button></form>
 <article v-for="record in state.history" :key="record.id"><h4>{{record.freshness}} · {{new Date(record.createdAt).toLocaleString()}}</h4><small v-if="record.context">记录时 Profile: {{record.context.integrityProfile}} · {{record.context.profileResolverVersion}}</small><small v-else>历史记录未存储 profile 解析快照；不以当前解析替换。</small><p v-for="view in views" :key="view">{{view}}：{{record.decisions[view]}}</p>
 <ul><template v-for="view in views" :key="view"><li v-for="issue in record.reports[view].issues" :key="issue.id">{{view}} · {{issue.affectedRegion}} · {{issue.severity}} · {{issue.description}}</li></template></ul>
 <details><summary>修复建议（仅提案，未执行）</summary><pre>{{JSON.stringify(record.repairProposals,null,2)}}</pre></details></article>
 </template></section>
</template>
<script setup lang="ts">
import {ref,computed,watch,onBeforeUnmount} from 'vue';
import axios from '@/utils/axios';
const props=defineProps<{projectId:number;scriptId:number;experimentId:string}>();
const views=['SIDE','BACK','CROSS_VIEW'],fields=[{key:'identity',label:'身份 / 跨视图身份'},{key:'view',label:'视角 / 结构连续性'},{key:'contamination',label:'额外主体 / 物品污染'}];
const categories=['PART_COUNT','PART_ATTACHMENT','ORIENTATION','TOPOLOGY','SUPPORT','SYMMETRY','PERSPECTIVE','MATERIAL','FUNCTION','CONTAMINATION'];
const freshReports=()=>Object.fromEntries(views.map(v=>[v,{reviewed:false,identity:'UNKNOWN',view:'UNKNOWN',contamination:'UNKNOWN',issues:[]}]));
const state=ref<any>(null),reports=ref<any>(freshReports()),busy=ref(false),error=ref('');let generation=0;
const externalConfirmed=ref(false),pipelineRecords=computed(()=>state.value?.history.filter((r:any)=>r.pipeline)??[]);
const latestFast=computed(()=>pipelineRecords.value.find((r:any)=>r.pipeline.kind==='FAST'&&r.freshness==='CURRENT'));
const canEscalate=computed(()=>latestFast.value&&Object.values(latestFast.value.pipeline.fast).some((f:any)=>['SUSPECT','UNAVAILABLE'].includes(f.status))&&!pipelineRecords.value.some((r:any)=>r.pipeline.fastReportId===latestFast.value.id));
const regions=computed(()=>[...(state.value?.profile?.regions??[]),'结构','连接','数量','方向','其他']);
const scope=()=>({projectId:props.projectId,scriptId:props.scriptId,experimentId:props.experimentId});
watch(()=>[props.projectId,props.scriptId,props.experimentId],()=>{generation++;state.value=null;reports.value=freshReports();externalConfirmed.value=false;busy.value=false;error.value='';void load();},{immediate:true});
onBeforeUnmount(()=>generation++);
async function load(){if(busy.value)return;const token=generation;busy.value=true;try{const r:any=await axios.post('/v04/multiview/integrity/current',scope());if(token===generation)state.value=r.data;}catch(e:any){if(token===generation)error.value=e?.response?.data?.message||'检查记录读取失败';}finally{if(token===generation)busy.value=false;}}
function add(view:string){reports.value[view].issues.push({id:crypto.randomUUID(),category:view==='CROSS_VIEW'?'CROSS_VIEW':'ORIENTATION',affectedRegion:regions.value[0],description:'',severity:'MODERATE',confidence:'HIGH',localizable:true,repairability:'LOCAL_REPAIR',evidenceViews:view==='CROSS_VIEW'?['MAIN','SIDE','BACK']:[view]});}
async function save(){if(busy.value||!state.value?.input)return;const token=generation,body={...scope(),expectedInput:state.value.input,reports:JSON.parse(JSON.stringify(reports.value))};busy.value=true;error.value='';try{await axios.post('/v04/multiview/integrity/record',body);if(token===generation){busy.value=false;await load();}}catch(e:any){if(token===generation)error.value=e?.response?.data?.message||'保存失败，请刷新检查';}finally{if(token===generation)busy.value=false;}}
async function quality(kind:'fast'|'vision'){if(busy.value||kind==='vision'&&(!canEscalate.value||!externalConfirmed.value))return;const token=generation,body=kind==='fast'?scope():{...scope(),fastReportId:latestFast.value.id,confirmExternalInspection:true};busy.value=true;error.value='';try{await axios.post('/v04/multiview/quality/'+kind,body);if(token===generation){externalConfirmed.value=false;busy.value=false;await load();}}catch(e:any){if(token===generation)error.value=e?.response?.data?.message||'检查交付结果不确定，请刷新记录；不会自动重复外部调用。';}finally{if(token===generation)busy.value=false;}}
async function feedback(visionReportId:string,usefulness:string){if(busy.value)return;const token=generation;busy.value=true;error.value='';try{await axios.post('/v04/multiview/quality/feedback',{...scope(),visionReportId,usefulness});if(token===generation){busy.value=false;await load();}}catch(e:any){if(token===generation)error.value=e?.response?.data?.message||'反馈保存失败';}finally{if(token===generation)busy.value=false;}}
</script>
<style scoped>
.integrity-panel{margin-top:1rem;padding:1rem;border:1px solid #596171;background:#171b22}.integrity-panel article{padding:.8rem;border-top:1px solid #596171}.integrity-panel label{display:inline-block;margin:.4rem}.issue{padding:.5rem;border:1px solid #596171}select,textarea,button{background:#252b36;color:#e2e7ef;border:1px solid #596171;padding:.4rem}textarea{display:block;width:95%}pre{white-space:pre-wrap;max-height:320px;overflow:auto}
</style>
