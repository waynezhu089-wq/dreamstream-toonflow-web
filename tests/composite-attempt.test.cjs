const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
for(const key of ['window','document','Element','HTMLElement','SVGElement','Node','Event'])global[key]=dom.window[key];
const vue=require('vue'),ts=require('typescript'),{parse,compileScript}=require('vue/compiler-sfc');
const file=path.resolve(__dirname,'../src/views/production/components/CompositeAttempt.vue');
const settle=async()=>{for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,0));await vue.nextTick();}};
function fixture(t){
 const requests=[],events=[],props=vue.reactive({projectId:1,scriptId:10,storyboardId:5,primaryAssetId:6});
 const state={id:1,status:'AWAITING_QUAD',backgroundUrl:'/background.png',width:576,height:1024,primaryAssetId:6};
 const code=ts.transpileModule(compileScript(parse(fs.readFileSync(file,'utf8'),{filename:file}).descriptor,{id:'composite',inlineTemplate:true}).content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const m={exports:{}};
 new Function('require','module','exports',code)(id=>id==='@/utils/axios'?{post:async(url,body)=>{requests.push({url,body:JSON.parse(JSON.stringify(body))});if(url.endsWith('/finish'))return{data:{...state,status:'COMPLETED',screenQuad:body.screenQuad,finalUrl:'/final.png'}};if(url.endsWith('/start'))return{data:{...state,id:2,status:'BACKGROUND_RUNNING'}};return{data:body.scriptId===10?{...state}:null};}}:require(id),m,m.exports);
 const el=document.createElement('div');document.body.append(el);
 const app=vue.createApp({render:()=>vue.h(m.exports.default,{...props,onCompleted:x=>events.push(x)})});
 app.component('t-dialog',{template:'<div><slot /></div>'});app.component('t-button',{props:['disabled'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'});app.mount(el);
 t.after(()=>{app.unmount();el.remove();});
 const button=text=>[...el.querySelectorAll('button')].find(b=>b.textContent===text);
 async function fill(){const inputs=el.querySelectorAll('fieldset input[type=number]');for(const [i,v]of [132,268,355,247,451,760,223,797].entries()){inputs[i].value=v;inputs[i].dispatchEvent(new Event('input',{bubbles:true}));}await settle();}
 return{el,requests,props,state,events,button,fill};
}
test('real component loads scoped attempt; background alone cannot complete or auto-confirm; manual finish uses all four corners',async t=>{
 const f=fixture(t);await settle();assert.deepEqual(f.requests[0].body,{projectId:1,scriptId:10,storyboardId:5});
 assert.equal(f.events.length,0);assert.equal(f.button('合成真实素材').disabled,true);await f.fill();assert.equal(f.button('合成真实素材').disabled,true);
 const checkbox=f.el.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await settle();
 assert.equal(f.button('合成真实素材').disabled,false);f.button('合成真实素材').click();await settle();
 const request=f.requests.find(r=>r.url.endsWith('/finish'));assert.equal(request.body.scriptId,10);assert.equal(request.body.attemptId,1);assert.equal(request.body.confirmed,true);assert.deepEqual(request.body.screenQuad.topLeft,{x:132,y:268});
 assert.deepEqual(f.events.at(-1),{id:5,src:'/final.png',state:'已完成',reason:''});assert.ok(f.el.querySelector('img[src="/final.png"]'));
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


