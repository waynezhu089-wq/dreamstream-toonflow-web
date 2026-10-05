const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path'),fs=require('node:fs');
const {JSDOM}=require('jsdom'),dom=new JSDOM('<html><body></body></html>');
for(const key of ['window','document','Element','HTMLElement','SVGElement','Node','Event'])global[key]=dom.window[key];
const vue=require('vue'),{loadVueSource}=require('./helpers/load-vue-source.cjs');
const file=path.resolve(__dirname,'../src/views/pilot/DirectorInspection.vue');
const flush=async()=>{for(let i=0;i<4;i++){await Promise.resolve();await vue.nextTick();}};
test('Director inspection is explicit read-only, prevents duplicate requests and discards late old-unit response',async t=>{
 const calls=[];let resolve;const axios={post:(url,body)=>{calls.push({url,body});return new Promise(r=>resolve=r);}};
 const component=loadVueSource(file,name=>name==='@/utils/axios'?{__esModule:true,default:axios}:require(name)).default;
 const props=vue.reactive({projectId:9,scriptId:2}),el=document.createElement('div');document.body.append(el);const app=vue.createApp({render:()=>vue.h(component,props)});app.mount(el);t.after(()=>{app.unmount();el.remove();});await flush();assert.equal(calls.length,0);
 el.querySelector('button').click();el.querySelector('button').click();await flush();assert.deepEqual(calls,[{url:'/v04/director/dry-run',body:{projectId:9,scriptId:2}}]);assert.equal(el.querySelector('button').disabled,true);
 props.projectId=10;props.scriptId=3;await flush();resolve({data:{status:'OLD_PROJECT'}});await flush();assert.equal(el.querySelector('pre'),null);
 el.querySelector('button').click();await flush();resolve({data:{status:'CANDIDATE_ONLY',persisted:false,affectsGeneration:false,sourceCreativeVersion:2}});await flush();assert.match(el.querySelector('pre').textContent,/CANDIDATE_ONLY/);assert.match(el.textContent,/未持久化/);assert.equal(calls.length,2);assert.ok(calls.every(x=>!/(confirm|apply|reconcile|generate)/.test(x.url)));
});
test('Professional registers Director candidate inspection without changing Studio generation surface',()=>{
 const shell=fs.readFileSync(path.resolve(__dirname,'../src/views/pilot/PilotShell.vue'),'utf8');assert.match(shell,/import DirectorInspection/);assert.match(shell,/key:\s*['"]director['"]/);assert.match(shell,/<DirectorInspection[^>]+project-id[^>]+script-id/);
});
