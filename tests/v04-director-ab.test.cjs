const assert=require('node:assert/strict'),{test}=require('node:test'),path=require('node:path'),fs=require('node:fs');
const {JSDOM}=require('jsdom'),dom=new JSDOM('<html><body></body></html>');
for(const key of ['window','document','Element','HTMLElement','SVGElement','Node','Event','KeyboardEvent'])global[key]=dom.window[key];
let urls=0;URL.createObjectURL=blob=>{assert.ok(blob instanceof Blob);return `blob:test-${++urls}`;};URL.revokeObjectURL=()=>{};
const vue=require('vue'),{loadVueSource}=require('./helpers/load-vue-source.cjs');
const file=path.resolve(__dirname,'../src/views/pilot/DirectorAssetABPanel.vue');
const flush=async()=>{for(let i=0;i<12;i++){await Promise.resolve();await vue.nextTick();}};
const fixture=(status='COMPILED')=>({id:'experiment-1',status,sourceHash:'s',pairHash:'p',evidence:{acceptedDirectorVersion:1,visualSpecSource:'PERSISTED_DRAFT'},
 A:{renderedPrompt:'current exact prompt'},B:{renderedPrompt:'current exact prompt plus director',directorContext:{narrativeRole:{narrativeFunction:'living threshold',emotionalRead:'awe first',scaleFunction:'ship swallowing',requiredAudiencePerception:['ancient'],forbiddenInterpretations:['mascot','horror']},relevantScaleRelations:[{smaller:'SHIP',larger:'WHALE',requirement:'vast scale'}]}},
 sharedExecution:{seed:42,profile:'KREA2_T2I_ASSET_V1',width:768,height:1024},workflows:{},execution:{}});
function mount(t,post,initial={projectId:9,scriptId:2}){const component=loadVueSource(file,n=>n==='@/utils/axios'?{__esModule:true,default:{post}}:require(n)).default,props=vue.reactive(initial),el=document.createElement('div');document.body.append(el);const app=vue.createApp({render:()=>vue.h(component,props)});app.mount(el);t.after(()=>{app.unmount();el.remove();});return {props,el};}
const button=(el,text)=>[...el.querySelectorAll('button')].find(b=>b.textContent.includes(text));
test('DIR032A mounted semantic gate compiles without rendering; explicit dialog and duplicate click guard',async t=>{
 const calls=[];let finish;const c=fixture(),{el}=mount(t,async(url,body)=>{calls.push({url,body});if(url.endsWith('/current'))return {data:[]};if(url.endsWith('/compile'))return {data:c};if(url.endsWith('/render'))return new Promise(r=>finish=r);throw Error(url);});await flush();assert.equal(calls.length,1);
 button(el,'编译鲸鱼').click();await flush();assert.equal(calls.length,2);assert.ok(calls.every(c=>!c.url.endsWith('/render')));assert.match(el.textContent,/Director 为鲸鱼新增了什么/);assert.match(el.textContent,/awe first/);
 const details=el.querySelector('details');assert.equal(details.open,false);details.open=true;assert.match(details.textContent,/current exact prompt/);
 button(el,'生成 A/B 对照图').click();await flush();assert.match(el.querySelector('[role=dialog]').textContent,/不会替换当前鲸鱼/);assert.equal(calls.length,2);
 button(el,'确认生成两张').click();button(el,'确认生成两张').click();await flush();assert.equal(calls.filter(c=>c.url.endsWith('/render')).length,1);assert.deepEqual(calls.at(-1).body,{projectId:9,scriptId:2,experimentId:c.id,pairHash:'p',confirmRender:true});
 finish({data:{...c,status:'FAILED',execution:{A:{status:'FAILED',errorCode:'OUT_OF_MEMORY'},B:{status:'NOT_RUN'}}}});await flush();assert.match(el.textContent,/OUT_OF_MEMORY/);assert.match(el.textContent,/NOT_RUN/);assert.equal(el.querySelector('form'),null);assert.doesNotMatch(el.textContent,/Adopt|采用此图/);
});
test('DIR032A completed reload restores side-by-side candidates, lightbox and human-only evaluation',async t=>{
 const c=fixture('COMPLETED');c.execution={A:{status:'SUCCEEDED',artifact:{artifactId:'a'}},B:{status:'SUCCEEDED',artifact:{artifactId:'b'}}};const calls=[];
 const {el}=mount(t,async(url,body)=>{calls.push({url,body});if(url.endsWith('/current'))return {data:[c]};if(url.endsWith('/artifact'))return new Blob(['image'],{type:'image/png'});if(url.endsWith('/evaluate'))return {data:{conclusion:body.conclusion,why:body.why}};throw Error(url);});await flush();
 assert.equal(el.querySelectorAll('.ab-columns .ab-image img').length,2);assert.match(el.textContent,/A · SUCCEEDED/);assert.match(el.textContent,/B · SUCCEEDED/);assert.equal(calls.filter(c=>c.url.endsWith('/render')).length,0);
 el.querySelector('.ab-image').click();await flush();assert.ok(document.body.querySelector('.studio-lightbox'));document.body.querySelector('.studio-lightbox').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));await flush();assert.equal(document.body.querySelector('.studio-lightbox'),null);
 const selects=el.querySelectorAll('form select');assert.equal(selects.length,7);selects.forEach((s,i)=>{s.value=i===6?'PARTIAL_WIN':'B';s.dispatchEvent(new Event('change',{bubbles:true}));});await flush();el.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await flush();const request=calls.find(c=>c.url.endsWith('/evaluate'));assert.deepEqual(request.body.choices,Array(6).fill('B'));assert.equal(request.body.conclusion,'PARTIAL_WIN');assert.match(el.textContent,/已保存：PARTIAL_WIN/);
});
test('DIR032A context switch discards late compile and late artifact responses',async t=>{
 let compile;const calls=[],{el,props}=mount(t,(url,body)=>{calls.push({url,body});if(url.endsWith('/current'))return Promise.resolve({data:[]});if(url.endsWith('/compile'))return new Promise(r=>compile=r);throw Error(url);});await flush();button(el,'编译鲸鱼').click();await flush();props.projectId=10;props.scriptId=3;await flush();compile({data:fixture()});await flush();assert.equal(el.querySelector('details'),null);assert.equal(calls.at(-1).body.projectId,10);assert.ok(calls.every(c=>!c.url.endsWith('/render')));
});
test('DIR032A late old-scope image download cannot populate the new unit',async t=>{
 const c=fixture('COMPLETED');c.execution.A={status:'SUCCEEDED',artifact:{artifactId:'a'}};let finishImage;
 const {el,props}=mount(t,(url,body)=>{if(url.endsWith('/current'))return Promise.resolve({data:body.projectId===9?[c]:[]});if(url.endsWith('/artifact'))return new Promise(r=>finishImage=r);throw Error(url);});await flush();
 assert.ok(finishImage);props.projectId=10;props.scriptId=3;await flush();finishImage(new Blob(['old image'],{type:'image/png'}));await flush();assert.equal(el.querySelector('img'),null);assert.equal(el.querySelector('details'),null);
});
test('DIR032A Professional surface is separate from normal Studio generation',()=>{
 const shell=fs.readFileSync(path.resolve(__dirname,'../src/views/pilot/PilotShell.vue'),'utf8');assert.match(shell,/<DirectorAssetABPanel v-if="tab==='director'"/);
 const source=fs.readFileSync(file,'utf8');assert.doesNotMatch(source,/auto-assets\/reconcile|draft-image\/enqueue|image-edit\/accept/);
});

test('DIR032AH1 inherited and excluded DNA are visible without expanding raw audit JSON',async t=>{
 const c=fixture();c.B.directorContext.assetVisualDNA={inherited:{artStyle:'cinematic realism',lightingLanguage:['blue environmental moonlight']},excluded:{materialLanguage:['Dream Matter particles'],recurringVisualMotifs:['boy reaching moon']},materialIdentity:'LIVING_BIOLOGICAL_CREATURE',projectionReasons:[]};
 const {el}=mount(t,async()=>({data:[c]}));await flush();
 assert.equal(el.querySelector('details').open,false);
 assert.match(el.querySelector('.dna-inherited').textContent,/cinematic realism/);
 assert.match(el.querySelector('.dna-excluded').textContent,/Dream Matter particles/);
 assert.doesNotMatch(el.querySelector('.dna-inherited').textContent,/Dream Matter particles/);
 assert.equal(el.querySelector('[role=dialog]'),null);
});
test('DIR032AH2 persisted artifacts restore on remount with direct Blob response contract',async t=>{
 const c=fixture('COMPLETED');c.execution={A:{status:'SUCCEEDED',artifact:{artifactId:'a'}},B:{status:'SUCCEEDED',artifact:{artifactId:'b'}}};const calls=[];
 const post=async(url,body,config)=>{calls.push({url,body,config});if(url.endsWith('/current'))return {data:[c]};if(url.endsWith('/artifact')){assert.equal(config.responseType,'blob');return new Blob(['png'],{type:'image/png'});}throw Error(url);};
 for(let i=0;i<2;i++){const {el}=mount(t,post);await flush();assert.equal(el.querySelectorAll('.ab-image img').length,2);assert.doesNotMatch(el.textContent,/实验图片读取失败/);assert.equal(el.querySelectorAll('form select').length,7);assert.doesNotMatch(el.textContent,/Adopt|采用此图/);}
 assert.ok(calls.some(x=>x.body.side==='A'));assert.ok(calls.some(x=>x.body.side==='B'));assert.ok(calls.every(x=>!x.url.endsWith('/render')));
});
test('DIR032AH2 invalid binary response only reports read failure without changing completed result or rendering',async t=>{
 const c=fixture('COMPLETED');c.execution={A:{status:'SUCCEEDED',artifact:{artifactId:'a'}},B:{status:'SUCCEEDED',artifact:{artifactId:'b'}}};const calls=[];
 const {el}=mount(t,async url=>{calls.push(url);return url.endsWith('/current')?{data:[c]}:{data:new Blob(['wrong wrapper'])};});await flush();assert.match(el.textContent,/实验图片读取失败，可刷新重试/);assert.match(el.textContent,/COMPLETED/);assert.equal(el.querySelector('img'),null);assert.ok(calls.every(x=>!x.endsWith('/render')));assert.equal(c.status,'COMPLETED');
});
