const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path'),fs=require('node:fs');
const {JSDOM}=require('jsdom'),dom=new JSDOM('<html><body></body></html>');
for(const key of ['window','document','Element','HTMLElement','SVGElement','Node','Event','KeyboardEvent'])global[key]=dom.window[key];
let urls=0;URL.createObjectURL=blob=>{assert.ok(blob instanceof Blob);return `blob:mv-${++urls}`;};URL.revokeObjectURL=()=>{};
const vue=require('vue'),{loadVueSource}=require('./helpers/load-vue-source.cjs');
const file=path.resolve(__dirname,'../src/views/pilot/MultiViewPilotPanel.vue');
const flush=async()=>{for(let i=0;i<20;i++){await Promise.resolve();await vue.nextTick();}};
const fixture=(status='COMPILED')=>({id:'experiment-1',status,canonicalKey:'CHAR-007',assetRevision:2,experimentHash:'hash',source:{type:'ACCEPTED_IDENTITY_BASELINE',width:768,height:768},sharedExecution:{seed:42,profile:'KREA2_DERIVE_CHARACTER_REFERENCE_V1'},execution:{},
 SIDE:{prompt:'same subject side-oriented; change viewpoint only',brief:{preserve:['same clothes','same barefoot state'],viewpointInstruction:['side information'],conservativeInferenceRules:[]}},
 BACK:{prompt:'same subject primarily from behind; change viewpoint only',brief:{preserve:['same clothes','same barefoot state'],viewpointInstruction:['back information'],conservativeInferenceRules:['infer unseen details conservatively']}}});
function mount(t,post){const component=loadVueSource(file,n=>n==='@/utils/axios'?{__esModule:true,default:{post}}:require(n)).default,props=vue.reactive({projectId:9,scriptId:2}),el=document.createElement('div');document.body.append(el);const app=vue.createApp({render:()=>vue.h(component,props)});app.mount(el);t.after(()=>{app.unmount();el.remove();});return {el,props};}
const button=(el,text)=>[...el.querySelectorAll('button')].find(b=>b.textContent.includes(text));
test('MV033A Professional entry, source, both briefs, folded audit and compile never render',async t=>{
 const calls=[],{el}=mount(t,async(url,body)=>{calls.push({url,body});if(url.endsWith('/current'))return {data:[]};if(url.endsWith('/compile'))return {data:fixture()};if(url.endsWith('/artifact'))return new Blob(['image'],{type:'image/png'});throw Error(url);});await flush();button(el,'编译男孩').click();await flush();
 assert.match(el.textContent,/Multi-View Pilot|SIDE-ish|BACK-ish|side-oriented|primarily from behind/);assert.equal(el.querySelector('details').open,false);assert.ok(el.querySelector('img[alt="男孩当前主身份图"]'));assert.equal(calls.filter(c=>c.url.endsWith('/render')).length,0);assert.ok(button(el,'生成 Side / Back').disabled);
 const shell=fs.readFileSync(path.resolve(__dirname,'../src/views/pilot/PilotShell.vue'),'utf8');assert.match(shell,/<MultiViewPilotPanel v-else-if="tab==='multiview'"/);assert.match(shell,/key:'multiview',label:'Multi-View Pilot'/);
 const source=fs.readFileSync(file,'utf8');assert.doesNotMatch(source,/image-edit\/accept|auto-assets\/reconcile|draft-image\/enqueue|reference-pack\/apply/);
});
test('MV033A source review plus second confirmation, duplicate click blocked and no adoption',async t=>{
 let finish;const calls=[],{el}=mount(t,(url,body)=>{calls.push({url,body});if(url.endsWith('/current'))return Promise.resolve({data:[fixture()]});if(url.endsWith('/artifact'))return Promise.resolve(new Blob(['image'],{type:'image/png'}));if(url.endsWith('/render'))return new Promise(r=>finish=r);throw Error(url);});await flush();
 const checkbox=el.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await flush();button(el,'生成 Side / Back').click();await flush();assert.match(el.querySelector('[role=dialog]').textContent,/不会替换现有素材/);assert.equal(calls.filter(c=>c.url.endsWith('/render')).length,0);
 button(el,'确认生成两个').click();button(el,'确认生成两个').click();await flush();assert.equal(calls.filter(c=>c.url.endsWith('/render')).length,1);assert.deepEqual(calls.at(-1).body,{projectId:9,scriptId:2,experimentId:'experiment-1',experimentHash:'hash',confirmRender:true,sourceQualityConfirmed:true});
 finish({data:{...fixture('FAILED'),execution:{SIDE:{status:'FAILED',errorCode:'COMFY_TIMEOUT'},BACK:{status:'NOT_RUN'}}}});await flush();assert.match(el.textContent,/COMFY_TIMEOUT|NOT_RUN/);assert.equal(el.querySelector('form'),null);assert.ok(button(el,'生成 Side / Back').disabled);
});
test('MV033A remount restores Blob MAIN/SIDE/BACK, lightbox and human PASS/PARTIAL/FAIL without rerender',async t=>{
 const c=fixture('COMPLETED');c.execution={SIDE:{status:'SUCCEEDED',artifact:{artifactId:'a'}},BACK:{status:'SUCCEEDED',artifact:{artifactId:'b'}}};const calls=[];
 const {el}=mount(t,async(url,body)=>{calls.push({url,body});if(url.endsWith('/current'))return {data:[c]};if(url.endsWith('/artifact'))return new Blob(['image'],{type:'image/png'});if(url.endsWith('/evaluate'))return {data:{SIDE:body.SIDE,BACK:body.BACK}};throw Error(url);});await flush();assert.equal(el.querySelectorAll('.view-image img').length,3);assert.equal(calls.filter(c=>c.url.endsWith('/render')).length,0);
 el.querySelector('.view-image').click();await flush();assert.ok(document.body.querySelector('.studio-lightbox'));document.body.querySelector('.studio-lightbox').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await flush();assert.equal(document.body.querySelector('.studio-lightbox'),null);
 const selects=el.querySelectorAll('form select');selects.forEach((s,i)=>{s.value=i?'FAIL':'PARTIAL_PASS';s.dispatchEvent(new Event('change',{bubbles:true}));});await flush();el.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();assert.deepEqual(calls.find(c=>c.url.endsWith('/evaluate')).body,{projectId:9,scriptId:2,experimentId:'experiment-1',SIDE:'PARTIAL_PASS',BACK:'FAIL',why:''});assert.match(el.textContent,/需另行人工授权/);assert.ok(![...el.querySelectorAll('button')].some(b=>/采用|Adopt|执行 fallback/.test(b.textContent)));
});
test('MV033A scope switch ignores late compile',async t=>{
 let done;const {el,props}=mount(t,(url)=>{if(url.endsWith('/current'))return Promise.resolve({data:[]});if(url.endsWith('/compile'))return new Promise(r=>done=r);throw Error(url);});await flush();button(el,'编译男孩').click();await flush();props.projectId=10;props.scriptId=3;await flush();done({data:fixture()});await flush();assert.equal(el.querySelector('details'),null);
});
test('MV033A late old source Blob cannot populate new project',async t=>{
 let done;const {el,props}=mount(t,(url,body)=>{if(url.endsWith('/current'))return Promise.resolve({data:body.projectId===9?[fixture()]:[]});if(url.endsWith('/artifact'))return new Promise(r=>done=r);throw Error(url);});await flush();props.projectId=10;props.scriptId=3;await flush();done(new Blob(['old'],{type:'image/png'}));await flush();assert.equal(el.querySelector('img'),null);
});
test('MV033A stale experiment displays old images but cannot render',async t=>{
 const {el}=mount(t,async(url)=>url.endsWith('/current')?{data:[fixture('STALE')]}:new Blob(['image'],{type:'image/png'}));await flush();assert.match(el.textContent,/STALE/);assert.ok(button(el,'生成 Side / Back').disabled);assert.equal(el.querySelector('input[type=checkbox]'),null);
});
test('MV033A late render acknowledgement cannot refresh a different production unit',async t=>{
 let finish;const calls=[],{el,props}=mount(t,(url,body)=>{calls.push({url,body});if(url.endsWith('/current'))return Promise.resolve({data:body.projectId===9?[fixture()]:[]});if(url.endsWith('/artifact'))return Promise.resolve(new Blob(['image'],{type:'image/png'}));if(url.endsWith('/render'))return new Promise(r=>finish=r);throw Error(url);});await flush();
 const checkbox=el.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await flush();button(el,'生成 Side / Back').click();await flush();button(el,'确认生成两个').click();await flush();props.projectId=10;props.scriptId=3;await flush();finish({data:fixture('RENDERING_SIDE')});await flush();assert.equal(el.querySelector('details'),null);assert.equal(calls.filter(c=>c.url.endsWith('/render')).length,1);assert.equal(calls.find(c=>c.url.endsWith('/render')).body.projectId,9);
});
