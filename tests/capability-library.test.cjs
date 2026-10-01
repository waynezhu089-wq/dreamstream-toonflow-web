const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
for(const key of ['window','document','Element','HTMLElement','SVGElement','Node','Event'])global[key]=dom.window[key];
const vue=require('vue'),ts=require('typescript'),{parse,compileScript}=require('vue/compiler-sfc');
const file=path.resolve(__dirname,'../src/components/CapabilityLibrary.vue');
const settle=async()=>{for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,0));await vue.nextTick();}};
function fixture(t){
 const calls=[],endpoint={id:'00000000-0000-4000-8000-000000000001',name:'Local Comfy',baseUrl:'http://127.0.0.1:8188',enabled:1};
 const version={familyKey:'comfy.z-image-turbo.txt2img',capabilityId:'comfy.z-image-turbo.txt2img.v1',status:'DRAFT',endpointId:endpoint.id,
  workflowJson:'{"9":{"class_type":"SaveImage","inputs":{"images":["1",0]}}}',
  inputPorts:[{name:'prompt',type:'text',required:true,label:'提示词'},{name:'width',type:'number',required:true,label:'宽度'}],outputPorts:[{name:'image',type:'image',label:'图片'}],
  inputMappings:[{portName:'prompt',nodeId:'1',inputKey:'text'}],outputMappings:[{portName:'image',nodeId:'9',field:'images'}],runtimeConfig:{timeoutMs:120000,pollIntervalMs:1000}};
 const family={familyKey:version.familyKey,displayName:'Z-Image 文生图',category:'image',executorType:'COMFY_UI',updatedAt:1,versions:[{capabilityId:version.capabilityId,version:1,status:'DRAFT',updatedAt:1}]};
 const post=async(url,body)=>{calls.push({url,body:JSON.parse(JSON.stringify(body))});
  if(url.endsWith('/endpoint/list'))return{data:[endpoint]};if(url.endsWith('/list'))return{data:[family]};if(url.endsWith('/version/get'))return{data:structuredClone(version)};
  if(url.endsWith('/version/test'))return{data:{executionId:'run-1',status:'SUCCEEDED',promptId:'prompt-1',outputs:{image:{url:'/oss/real.png',filePath:'/capability/run-1/image-0.png'}}}};
  if(url.endsWith('/version/verify')){version.status='VERIFIED';family.versions[0].status='VERIFIED';return{data:structuredClone(version)};}
  if(url.endsWith('/execute'))return{data:{executionId:'run-2',status:'SUCCEEDED',promptId:'prompt-2',outputs:{image:{url:'/oss/real2.png'}}}};
  if(url.endsWith('/endpoint/save'))return{data:endpoint};if(url.endsWith('/family/create'))return{data:body};
  return{data:structuredClone(version)};
 };
 const script=compileScript(parse(fs.readFileSync(file,'utf8'),{filename:file}).descriptor,{id:'capability-library',inlineTemplate:true}).content;
 const code=ts.transpileModule(script,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const m={exports:{}};new Function('require','module','exports',code)(name=>name==='@/utils/axios'?{post}:require(name),m,m.exports);
 const el=document.createElement('div');document.body.append(el);const app=vue.createApp(m.exports.default);app.mount(el);
 t.after(()=>{app.unmount();el.remove();});const button=text=>{const b=[...el.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert.ok(b,text);return b;};
 return{el,calls,version,family,button};
}
test('library lists required columns; Draft test displays image, Verify locks version, exact execute stays available',async t=>{
 const f=fixture(t);await settle();
 for(const label of ['Name','Capability ID','Version','Category','Status','Executor','Updated','Z-Image 文生图','Draft'])assert.ok(f.el.textContent.includes(label),label);
 f.button('查看').click();await settle();assert.ok(f.el.textContent.includes('Logical Input Ports'));assert.ok(f.el.textContent.includes('Advanced / Setup'));
 const text=f.el.querySelector('.run input:not([type=number])');text.value='photo';text.dispatchEvent(new Event('input',{bubbles:true}));
 const width=f.el.querySelector('.run input[type=number]');width.value='576';width.dispatchEvent(new Event('input',{bubbles:true}));await settle();
 f.button('Test Run').click();await settle();const call=f.calls.find(c=>c.url.endsWith('/version/test'));
 assert.equal(call.body.capabilityId,'comfy.z-image-turbo.txt2img.v1');assert.deepEqual(call.body.inputs,{prompt:'photo',width:576});
 assert.ok(f.el.querySelector('img[src="/oss/real.png"]'));f.button('确认输出正确，标记 Verified').click();await settle();assert.ok(f.el.textContent.includes('已锁定'));
 assert.equal(f.el.textContent.includes('Workflow JSON'),false);f.button('按此版本再次执行').click();await settle();assert.ok(f.calls.some(c=>c.url.endsWith('/execute')&&c.body.capabilityId==='comfy.z-image-turbo.txt2img.v1'));
});
test('endpoint setup and new capability flow are reachable without exposing Comfy nodes in the library list',async t=>{
 const f=fixture(t);await settle();assert.equal(f.el.textContent.includes('Node ID'),false);
 f.el.querySelector('.endpoint summary').click();await settle();assert.ok(f.el.textContent.includes('Local Comfy'));
 f.button('新建能力').click();await settle();assert.ok(f.el.textContent.includes('Family Key'));assert.equal(f.el.textContent.includes('KSampler'),false);
});
test('new capability saves the Family separately and opens a Draft version editor',async t=>{
 const f=fixture(t);await settle();f.button('新建能力').click();await settle();
 const fields=f.el.querySelectorAll('.form input');for(const [i,value]of ['Example image','comfy.example.txt2img','image'].entries()){
  fields[i].value=value;fields[i].dispatchEvent(new Event('input',{bubbles:true}));
 }await settle();f.button('保存并配置 V1').click();await settle();
 const created=f.calls.find(c=>c.url.endsWith('/family/create'));assert.equal(created.body.familyKey,'comfy.example.txt2img');
 assert.equal(created.body.executorType,'COMFY_UI');assert.ok(f.el.textContent.includes('Logical Input Ports'));
 assert.equal(f.calls.some(c=>c.url.endsWith('/version/create')),false);
});
