const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
for(const key of ['window','document','Element','HTMLElement','SVGElement','Node','Event'])global[key]=dom.window[key];
const vue=require('vue'),ts=require('typescript'),{parse,compileScript}=require('vue/compiler-sfc');
const file=path.resolve(__dirname,'../src/views/production/components/CompositeAttempt.vue');
const settle=async()=>{for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,0));await vue.nextTick();}};
function fixture(t, overrides={}){
 const requests=[],events=[],reconciles=[],outcome={finishStatus:'COMPLETED'},props=vue.reactive({projectId:1,scriptId:10,storyboardId:5,primaryAssetId:6,...overrides});
 const state={id:1,status:'AWAITING_QUAD',backgroundUrl:'/background.png',width:576,height:1024,primaryAssetId:6};
 const code=ts.transpileModule(compileScript(parse(fs.readFileSync(file,'utf8'),{filename:file}).descriptor,{id:'composite',inlineTemplate:true}).content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const m={exports:{}};
 new Function('require','module','exports',code)(id=>id==='@/utils/axios'?{post:async(url,body)=>{requests.push({url,body:JSON.parse(JSON.stringify(body))});if(url.endsWith('/finish'))return{data:{...state,status:outcome.finishStatus,screenQuad:body.screenQuad,finalUrl:'/final.png'}};if(url.endsWith('/start'))return{data:{...state,id:2,status:'BACKGROUND_RUNNING'}};return{data:body.scriptId===10?{...state}:null};}}:require(id),m,m.exports);
 const el=document.createElement('div');document.body.append(el);
 const app=vue.createApp({render:()=>vue.h(m.exports.default,{...props,onCompleted:x=>events.push(x),onReconcile:()=>reconciles.push('refresh')})});
 app.component('t-dialog',{template:'<div><slot /></div>'});app.component('t-button',{props:['disabled'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'});app.mount(el);
 t.after(()=>{app.unmount();el.remove();});
 const button=text=>[...el.querySelectorAll('button')].find(b=>b.textContent===text);
 async function fill(){const inputs=el.querySelectorAll('fieldset input[type=number]');for(const [i,v]of [132,268,355,247,451,760,223,797].entries()){inputs[i].value=v;inputs[i].dispatchEvent(new Event('input',{bubbles:true}));}await settle();}
 return{el,requests,props,state,events,reconciles,outcome,button,fill};
}
test('real component loads scoped attempt; background alone cannot complete or auto-confirm; manual finish uses all four corners',async t=>{
 const f=fixture(t);await settle();assert.deepEqual(f.requests[0].body,{projectId:1,scriptId:10,storyboardId:5});
 assert.equal(f.events.length,0);assert.equal(f.button('合成真实素材').disabled,true);await f.fill();assert.equal(f.button('合成真实素材').disabled,true);
 const checkbox=f.el.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await settle();
 assert.equal(f.button('合成真实素材').disabled,false);f.button('合成真实素材').click();await settle();
 const request=f.requests.find(r=>r.url.endsWith('/finish'));assert.equal(request.body.scriptId,10);assert.equal(request.body.attemptId,1);assert.equal(request.body.confirmed,true);assert.deepEqual(request.body.screenQuad.topLeft,{x:132,y:268});
 assert.deepEqual(f.events.at(-1),{id:5,src:'/final.png',state:'已完成',reason:''});assert.ok(f.el.querySelector('img[src="/final.png"]'));
});
test('B1 composite defaults to execution prompt and never sends semantic UI text as background prompt',async t=>{
 const f=fixture(t,{semanticPrompt:'Show the real Logo and UI text',imagePrompt:'Empty phone screen on a desk'});await settle();
 assert.match(f.el.textContent,/Show the real Logo and UI text/);
 assert.equal(f.el.querySelector('textarea').value,'Empty phone screen on a desk');
 f.button('重新生成背景（新尝试）').click();await settle();
 const start=f.requests.find(r=>r.url.endsWith('/start'));
 assert.equal(start.body.prompt,'Empty phone screen on a desk');assert.equal(JSON.stringify(start.body).includes('Show the real Logo'),false);
 const fallback=fixture(t,{semanticPrompt:'Real brand logo on phone',imagePrompt:null});await settle();
 assert.match(fallback.el.querySelector('textarea').value,/屏幕不包含文字、按钮、Logo/);
});
test('editing quad revokes confirmation; retry creates new attempt without old quad; switching unit clears old output',async t=>{
 const f=fixture(t);await settle();await f.fill();const checkbox=f.el.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await settle();
 const x=f.el.querySelector('fieldset input[type=number]');x.value=130;x.dispatchEvent(new Event('input',{bubbles:true}));await settle();assert.equal(f.button('合成真实素材').disabled,true);
 f.button('重新生成背景（新尝试）').click();await settle();const request=f.requests.find(r=>r.url.endsWith('/start'));assert.equal(request.body.primaryAssetId,6);assert.equal(request.body.scriptId,10);assert.equal(request.body.screenQuad,undefined);assert.equal(f.el.querySelector('fieldset input[type=number]').value,'');
 f.props.scriptId=11;f.props.storyboardId=8;await settle();assert.equal(f.el.querySelector('svg'),null);assert.equal(f.requests.at(-1).body.scriptId,11);
});
test('entry is restricted to advertisement composite shots; no new automatic batch dispatch',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/views/production/node/storyboard.vue'),'utf8');
 assert.match(source,/project\?\.projectType === 'general_video' && project\?\.type === 'advertisement' && item\.productionMode === 'REAL_AI_COMPOSITE'/);
 assert.match(source,/:script-id="Number\(episodesId\)"/);
});

test('composite dialog stays in the viewport and wheel events scroll inside instead of reaching VueFlow',async t=>{
 const source=fs.readFileSync(file,'utf8');
 assert.match(source,/attach="body"/);
 assert.match(source,/placement="center"/);
 assert.match(source,/\.composite-dialog \{[^}]*max-height: calc\(100dvh - 96px\)/);
 assert.match(source,/\.composite-dialog \.t-dialog__body \{[^}]*overflow-y: auto/);
 const f=fixture(t);await settle();
 let canvasWheels=0,canvasPointerDowns=0;
 f.el.addEventListener('wheel',()=>canvasWheels++);
 f.el.addEventListener('pointerdown',()=>canvasPointerDowns++);
 const panel=f.el.querySelector('.composite-panel');
 const wheel=new dom.window.WheelEvent('wheel',{bubbles:true,cancelable:true,deltaY:120});
 panel.dispatchEvent(wheel);
 panel.dispatchEvent(new Event('pointerdown',{bubbles:true}));
 assert.equal(canvasWheels,0);
 assert.equal(canvasPointerDowns,0);
 assert.equal(wheel.defaultPrevented,false);
});

test('controlled composite refreshes on start and terminal only; waiting never replaces retained image',async t=>{
 const f=fixture(t);f.state.productionAttemptId='generic-1';await settle();
 assert.equal(f.events.length,0);assert.equal(f.reconciles.length,0);
 f.button('重新生成背景（新尝试）').click();await settle();
 assert.equal(f.reconciles.length,1);assert.equal(f.events.length,0);
 await new Promise(r=>setTimeout(r,1600));await settle();
 assert.equal(f.reconciles.length,1,'AWAITING_QUAD polling must not refresh the whole flow');
 await f.fill();const checkbox=f.el.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await settle();
 f.button('合成真实素材').click();await settle();
 assert.equal(f.reconciles.length,2);assert.equal(f.events.length,0,'controlled final must use server provenance');
 assert.match(f.el.textContent,/最终合成图/);
 const parent=fs.readFileSync(path.resolve(__dirname,'../src/views/production/node/storyboard.vue'),'utf8');
 assert.match(parent,/@reconcile="reconcileCompositeProvenance"/);
 assert.match(parent,/async function reconcileCompositeProvenance\(\) \{\s*await productionAgentStore\(\)\.getFlowData\(\)/);
});

test('controlled stale and failure remain distinct from completed; Legacy still emits local patch',async t=>{
 const stale=fixture(t);stale.state.productionAttemptId='generic-stale';stale.outcome.finishStatus='STALE';await settle();
 await stale.fill();let checkbox=stale.el.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await settle();
 stale.button('合成真实素材').click();await settle();
 assert.equal(stale.events.length,0);assert.equal(stale.reconciles.length,1);assert.match(stale.el.textContent,/未附着为当前镜头/);
 const failed=fixture(t);failed.state.productionAttemptId='generic-failed';failed.outcome.finishStatus='FAILED';await settle();
 await failed.fill();checkbox=failed.el.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await settle();
 failed.button('合成真实素材').click();await settle();
 assert.equal(failed.events.length,0);assert.equal(failed.reconciles.length,1);
 const legacy=fixture(t);await settle();await legacy.fill();checkbox=legacy.el.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await settle();
 legacy.button('合成真实素材').click();await settle();assert.equal(legacy.reconciles.length,0);assert.equal(legacy.events.length,1);
});


