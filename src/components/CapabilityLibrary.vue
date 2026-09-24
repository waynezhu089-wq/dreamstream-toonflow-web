<template>
  <div class="library">
    <header class="toolbar"><strong>Capability Library</strong><button @click="mode = 'new'">新建能力</button><button @click="refresh">刷新</button></header>
    <p v-if="error" role="alert" class="error">{{ error }}</p>
    <section v-if="mode === 'list'">
      <p>一个能力可以有多个版本。生产只调用已验证的指定版本。</p>
      <table><thead><tr><th>Name</th><th>Capability ID</th><th>Version</th><th>Category</th><th>Status</th><th>Executor</th><th>Updated</th><th>操作</th></tr></thead>
        <tbody><template v-for="family in families" :key="family.familyKey">
          <tr v-for="version in family.versions" :key="version.capabilityId">
            <td>{{ family.displayName }}</td><td class="id">{{ version.capabilityId }}</td><td>V{{ version.version }}</td><td>{{ family.category }}</td><td>{{ statusLabel(version.status) }}</td><td>{{ family.executorType }}</td><td>{{ displayTime(version.updatedAt) }}</td>
            <td><button @click="openVersion(version.capabilityId)">查看</button></td>
          </tr>
          <tr v-if="!family.versions.length"><td>{{ family.displayName }}</td><td class="id">{{ family.familyKey }}</td><td>—</td><td>{{ family.category }}</td><td>待创建版本</td><td>{{ family.executorType }}</td><td>{{ displayTime(family.updatedAt) }}</td><td><button @click="newVersionFor(family.familyKey)">配置 V1</button></td></tr>
        </template></tbody>
      </table>
      <p v-if="!families.length">还没有 Capability。先配置一个 Endpoint，再新建能力。</p>
    </section>

    <section v-if="mode === 'new'" class="form">
      <h3>新建能力</h3><p>这里只定义名称和用途。具体 Workflow 与 Port 保存在版本里。</p>
      <label>名称 <input v-model="familyForm.displayName" maxlength="256" /></label>
      <label>Family Key <input v-model="familyForm.familyKey" placeholder="comfy.example.txt2img" /></label>
      <label>描述 <textarea v-model="familyForm.description" rows="2" /></label>
      <label>类别 <input v-model="familyForm.category" placeholder="image" /></label>
      <p>Provider：ComfyUI　Executor：ComfyUI</p>
      <button :disabled="busy" @click="saveFamily">保存并配置 V1</button><button @click="mode = 'list'">返回</button>
    </section>

    <section v-if="mode === 'version'" class="form">
      <header class="toolbar"><button @click="mode = 'list'">返回能力库</button><h3>{{ selectedId || `${selectedFamily}.v1` }} · {{ statusLabel(selected?.status || 'DRAFT') }}</h3></header>
      <p v-if="selected?.status === 'VERIFIED'">该版本已锁定。调整 Workflow、Port 或 Mapping 请创建新版本。</p>
      <div class="toolbar" v-if="selectedId">
        <button @click="newVersionFor(selectedFamily, selectedId)">创建新版本</button>
        <button v-if="selected?.status === 'VERIFIED'" @click="disable">停用此版本</button>
      </div>
      <div v-if="editable" class="draft">
        <label>Endpoint <select v-model="draft.endpointId"><option value="">请选择</option><option v-for="endpoint in endpoints" :key="endpoint.id" :value="endpoint.id">{{ endpoint.name }} {{ endpoint.enabled ? '' : '（已停用）' }}</option></select></label>
        <label>导入 Comfy API Format Workflow JSON <input type="file" accept="application/json,.json" @change="readWorkflow" /></label>
        <p v-if="draft.workflowJson">已载入 Workflow JSON（{{ draft.workflowJson.length }} 字符）。普通操作无需修改节点。</p>
        <h4>Logical Input Ports</h4>
        <div v-for="(port,i) in draft.inputPorts" :key="i" class="row">
          <input v-model="port.name" placeholder="英文名，如 prompt" aria-label="输入名" />
          <input v-model="port.label" placeholder="显示名称" aria-label="输入标签" />
          <select v-model="port.type" aria-label="输入类型"><option v-for="type in inputTypes" :key="type">{{ type }}</option></select>
          <label><input v-model="port.required" type="checkbox" />必填</label>
          <button @click="removeInput(i)">删除</button>
        </div>
        <button @click="draft.inputPorts.push({ name:'',label:'',type:'text',required:true })">添加输入</button>
        <h4>Logical Output Ports</h4>
        <div v-for="(port,i) in draft.outputPorts" :key="i" class="row">
          <input v-model="port.name" placeholder="英文名，如 image" aria-label="输出名" />
          <input v-model="port.label" placeholder="显示名称" aria-label="输出标签" />
          <select v-model="port.type" aria-label="输出类型"><option v-for="type in outputTypes" :key="type">{{ type }}</option></select>
          <button @click="removeOutput(i)">删除</button>
        </div>
        <button @click="draft.outputPorts.push({name:'',label:'',type:'image'})">添加输出</button>
        <details><summary>Advanced / Setup · Port Mapping 与 Workflow</summary>
          <p>映射仅填写节点 ID 与字段名；不支持脚本或表达式。按 Comfy 导出的 API JSON 填写。</p>
          <label>Workflow JSON <textarea v-model="draft.workflowJson" rows="7" spellcheck="false" /></label>
          <h4>输入映射</h4>
          <div v-for="(mapping,i) in draft.inputMappings" :key="i" class="row">
            <select v-model="mapping.portName" aria-label="逻辑输入"><option value="">选择 Port</option><option v-for="port in draft.inputPorts" :key="port.name">{{ port.name }}</option></select>
            <input v-model="mapping.nodeId" placeholder="Node ID" aria-label="输入节点" /><input v-model="mapping.inputKey" placeholder="Input Key" aria-label="节点输入字段" />
            <button @click="draft.inputMappings.splice(i,1)">删除</button>
          </div><button @click="draft.inputMappings.push({portName:'',nodeId:'',inputKey:''})">添加输入映射</button>
          <h4>输出映射</h4>
          <div v-for="(mapping,i) in draft.outputMappings" :key="i" class="row">
            <select v-model="mapping.portName" aria-label="逻辑输出"><option value="">选择 Port</option><option v-for="port in draft.outputPorts" :key="port.name">{{ port.name }}</option></select>
            <input v-model="mapping.nodeId" placeholder="Node ID" aria-label="输出节点" /><input v-model="mapping.field" placeholder="Output Field，如 images" aria-label="输出字段" />
            <button @click="draft.outputMappings.splice(i,1)">删除</button>
          </div><button @click="draft.outputMappings.push({portName:'',nodeId:'',field:''})">添加输出映射</button>
          <h4>Runtime Config</h4><div class="row"><label>超时 ms <input v-model.number="draft.runtimeConfig.timeoutMs" type="number" min="100" max="600000" /></label><label>轮询 ms <input v-model.number="draft.runtimeConfig.pollIntervalMs" type="number" min="10" max="5000" /></label></div>
        </details>
        <button :disabled="busy" @click="saveDraft">保存 Draft</button>
      </div>
      <div v-if="selectedId" class="run">
        <h4>Test Run {{ selected?.status === 'DRAFT' ? '· 先测试，再人工审阅结果并 Verify' : '' }}</h4>
        <div v-for="port in selected?.inputPorts || []" :key="port.name">
          <label>{{ port.label }} <span v-if="port.required">* </span>
            <input v-if="port.type === 'number'" v-model.number="testInputs[port.name]" type="number" />
            <input v-else-if="port.type === 'boolean'" v-model="testInputs[port.name]" type="checkbox" />
            <select v-else-if="port.type === 'select'" v-model="testInputs[port.name]"><option v-for="opt in port.options || []" :key="opt" :value="opt">{{ opt }}</option></select>
            <input v-else v-model="testInputs[port.name]" :placeholder="port.type" />
          </label>
        </div>
        <button :disabled="busy" @click="runTest">{{ selected?.status === 'VERIFIED' ? '按此版本再次执行' : 'Test Run' }}</button>
        <div v-if="runResult"><p>Execution {{ runResult.executionId }} · {{ runResult.status }} · Prompt {{ runResult.promptId }}</p>
          <template v-for="(output,name) in runResult.outputs" :key="name"><p>{{ name }}</p><img v-if="!Array.isArray(output) && output.url" :src="output.url" :alt="String(name)" class="result" /><a v-else-if="!Array.isArray(output) && output.url" :href="output.url">查看输出</a></template>
        </div>
        <button v-if="selected?.status === 'DRAFT'" :disabled="busy || !runResult || runResult.status !== 'SUCCEEDED'" @click="verify">确认输出正确，标记 Verified</button>
      </div>
    </section>

    <details class="endpoint"><summary>Setup · Comfy Endpoint</summary>
      <p>首版只配置一个地址。生产执行使用 Version 绑定的 Endpoint，不自动切换。</p>
      <div v-for="endpoint in endpoints" :key="endpoint.id" class="row"><span>{{ endpoint.name }} · {{ endpoint.baseUrl }} · {{ endpoint.enabled ? '可用' : '停用' }}</span><button @click="editEndpoint(endpoint)">编辑</button></div>
      <label>名称 <input v-model="endpointForm.name" placeholder="Local Comfy" /></label>
      <label>地址 <input v-model="endpointForm.baseUrl" placeholder="http://127.0.0.1:8188" /></label>
      <label><input v-model="endpointForm.enabled" type="checkbox" />启用</label>
      <button :disabled="busy" @click="saveEndpoint">保存 Endpoint</button>
      <button @click="endpointForm = {name:'',baseUrl:'http://127.0.0.1:8188',enabled:true}">新增 Endpoint</button>
    </details>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import axios from "@/utils/axios";
const inputTypes = ["text", "number", "boolean", "select", "image", "image[]", "audio", "video", "mask", "json"];
const outputTypes = ["text", "image", "image[]", "audio", "video", "json"];
type InputPort = { name:string; label:string; type:string; required:boolean; defaultValue?:unknown; options?: Array<string|number> };
type OutputPort = { name:string; label:string; type:string };
type InputMapping = { portName:string; nodeId:string; inputKey:string };
type OutputMapping = { portName:string; nodeId:string; field:string };
type Draft = { endpointId:string; workflowJson:string; inputPorts:InputPort[]; outputPorts:OutputPort[]; inputMappings:InputMapping[]; outputMappings:OutputMapping[]; runtimeConfig:{timeoutMs:number;pollIntervalMs:number} };
const blankDraft = ():Draft => ({ endpointId:"",workflowJson:"",inputPorts:[],outputPorts:[],inputMappings:[],outputMappings:[],runtimeConfig:{timeoutMs:120000,pollIntervalMs:1000} });
const mode=ref<'list'|'new'|'version'>('list'),busy=ref(false),error=ref('');
const families=ref<any[]>([]),endpoints=ref<any[]>([]),selected=ref<any>(null),selectedId=ref(''),selectedFamily=ref(''),draft=ref<Draft>(blankDraft()),runResult=ref<any>(null),testInputs=ref<Record<string,any>>({});
const familyForm=ref({familyKey:'',displayName:'',description:'',category:'image',provider:'ComfyUI',executorType:'COMFY_UI'});
const endpointForm=ref<{id?:string;name:string;baseUrl:string;enabled:boolean}>({name:'',baseUrl:'http://127.0.0.1:8188',enabled:true});
const editable=computed(()=>!selected.value || selected.value.status==='DRAFT');
const statusLabel=(s:string)=>({DRAFT:'Draft',VERIFIED:'Verified',DISABLED:'Disabled'} as Record<string,string>)[s]||s;
const displayTime=(n:number)=>new Date(Number(n)).toLocaleString();
const post=async(path:string,body:any={})=>(await axios.post('/capabilities'+path,body) as any).data;
async function execute(action:()=>Promise<void>){busy.value=true;error.value='';try{await action();}catch(e:any){error.value=e?.message||'操作失败';}finally{busy.value=false;}}
async function refresh(){await execute(async()=>{[families.value,endpoints.value]=await Promise.all([post('/list'),post('/endpoint/list')]);});}
onMounted(refresh);
async function saveFamily(){await execute(async()=>{const family=await post('/family/create',familyForm.value);await refresh();await newVersionFor(family.familyKey);});}
async function newVersionFor(familyKey:string,sourceCapabilityId?:string){
  await execute(async()=>{
    selectedFamily.value=familyKey;runResult.value=null;
    if(sourceCapabilityId){const created=await post('/version/create',{familyKey,sourceCapabilityId});await openVersion(created.capabilityId);}
    else{selectedId.value='';selected.value=null;draft.value=blankDraft();mode.value='version';}
  });
}
async function openVersion(id:string){await execute(async()=>{
  const value=await post('/version/get',{capabilityId:id});selected.value=value;selectedId.value=id;selectedFamily.value=value.familyKey;
  draft.value={endpointId:value.endpointId,workflowJson:value.workflowJson,inputPorts:value.inputPorts,outputPorts:value.outputPorts,inputMappings:value.inputMappings,outputMappings:value.outputMappings,runtimeConfig:value.runtimeConfig};
  testInputs.value=Object.fromEntries(value.inputPorts.map((p:InputPort)=>[p.name,p.defaultValue??(p.type==='number'?undefined:p.type==='boolean'?false:'')]));runResult.value=null;mode.value='version';
});}
async function readWorkflow(event:Event){const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;try{draft.value.workflowJson=await file.text();JSON.parse(draft.value.workflowJson);error.value='';}catch{error.value='Workflow JSON 无法解析，请导出 Comfy API Format JSON';}}
function removeInput(i:number){const [p]=draft.value.inputPorts.splice(i,1);draft.value.inputMappings=draft.value.inputMappings.filter(m=>m.portName!==p.name);}
function removeOutput(i:number){const [p]=draft.value.outputPorts.splice(i,1);draft.value.outputMappings=draft.value.outputMappings.filter(m=>m.portName!==p.name);}
async function saveDraft(){await execute(async()=>{
  const body={...draft.value,workflowJson:draft.value.workflowJson};
  const value=selectedId.value?await post('/version/update',{capabilityId:selectedId.value,definition:body}):await post('/version/create',{familyKey:selectedFamily.value,definition:body});
  await openVersion(value.capabilityId);await refresh();
});}
async function runTest(){if(!selectedId.value)return;await execute(async()=>{runResult.value=null;runResult.value=await post(selected.value?.status==='VERIFIED'?'/execute':'/version/test',{capabilityId:selectedId.value,inputs:testInputs.value});});}
async function verify(){await execute(async()=>{await post('/version/verify',{capabilityId:selectedId.value});await openVersion(selectedId.value);await refresh();});}
async function disable(){await execute(async()=>{await post('/version/disable',{capabilityId:selectedId.value});await openVersion(selectedId.value);await refresh();});}
function editEndpoint(value:any){endpointForm.value={id:value.id,name:value.name,baseUrl:value.baseUrl,enabled:!!value.enabled};}
async function saveEndpoint(){await execute(async()=>{await post('/endpoint/save',endpointForm.value);endpoints.value=await post('/endpoint/list');endpointForm.value={name:'',baseUrl:'http://127.0.0.1:8188',enabled:true};});}
</script>
<style scoped>
.library{height:100%;overflow:auto;padding:8px 12px;color:var(--td-text-color-primary)}.toolbar,.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0}.toolbar h3{margin:0}button{padding:5px 10px;cursor:pointer}button:disabled{cursor:not-allowed;opacity:.5}table{width:100%;border-collapse:collapse;text-align:left}th,td{padding:8px;border-bottom:1px solid var(--td-component-border)}.id{overflow-wrap:anywhere}.form{max-width:900px}.form>label,.endpoint>label{display:block;margin:10px 0}.form>label>input,.form textarea,.endpoint input{display:block;width:100%;box-sizing:border-box}.row input{max-width:200px}.row input[type=checkbox]{width:auto}.draft,.run,.endpoint{margin-top:16px;border-top:1px solid var(--td-component-border);padding-top:12px}details{margin:14px 0}summary{cursor:pointer;font-weight:600}.result{display:block;max-width:100%;max-height:450px;object-fit:contain}.error{color:var(--td-error-color);white-space:pre-wrap}
</style>
