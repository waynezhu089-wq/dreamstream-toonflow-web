const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});
for(const key of ['window','document','Element','HTMLElement','SVGElement','Node','Event'])global[key]=dom.window[key];
const vue=require('vue'),ts=require('typescript'),{parse,compileScript}=require('vue/compiler-sfc');
const root=path.resolve(__dirname,'../src');
const settle=async()=>{for(let i=0;i<12;i++){await new Promise(resolve=>setTimeout(resolve,0));await vue.nextTick();}};
function component(relative,post){
 const file=path.join(root,relative),source=fs.readFileSync(file,'utf8');
 const code=ts.transpileModule(compileScript(parse(source,{filename:file}).descriptor,{id:'skill-ui',inlineTemplate:true}).content,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 const m={exports:{}};new Function('require','module','exports',code)(id=>id==='@/utils/axios'?{post}:require(id),m,m.exports);return m.exports.default;
}
function mount(t,Component,props={},listeners={}){
 const el=document.createElement('div');document.body.append(el);
 const app=vue.createApp({render:()=>vue.h(Component,{...props,...listeners})});
 app.component('t-dialog',{template:'<div><slot /></div>'});
 app.component('t-button',{props:['disabled','loading'],emits:['click'],template:'<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>'});
 app.component('t-empty',{template:'<div>EMPTY</div>'});app.mount(el);t.after(()=>{app.unmount();el.remove();});
 const button=text=>[...el.querySelectorAll('button')].find(b=>b.textContent.includes(text));
 function input(node,value){node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));}
 return{el,button,input};
}

test('Skill Library creates Manual Draft, saves structured IMAGE_PROMPT fields, activates and exposes Reverse Prompt unavailable boundary',async t=>{
 const families=[],calls=[],bindingRows=[],blank={purpose:'',inputs:[],rules:[],outputRequirements:[],prohibitions:[],applicableScenes:[],tags:[],subject:'',composition:'',cameraLens:'',lighting:'',color:'',material:'',spatialRelationship:'',style:'',detailDensity:'',background:'',motion:'',negativeConstraints:''};
 const post=async(url,body)=>{calls.push({url,body:JSON.parse(JSON.stringify(body))});let data;
  if(url.endsWith('/list'))data=families;
  else if(url.endsWith('/family/create')){data={...body,updatedAt:Date.now(),versions:[]};families.push(data);}
  else if(url.endsWith('/version/create')){data={skillId:body.skillId,version:'v1',status:'DRAFT',sourceType:'MANUAL',templateId:'image-prompt.v1',content:structuredClone(blank)};families[0].versions.unshift(data);}
  else if(url.endsWith('/get'))data={family:families[0],versions:families[0].versions};
  else if(url.endsWith('/version/edit')){families[0].versions[0].content=JSON.parse(JSON.stringify(body.content));data=families[0].versions[0];}
  else if(url.endsWith('/version/activate')){families[0].versions[0].status='ACTIVE';data=families[0].versions[0];}
  else if(url.endsWith('/version/preview'))data={runtimeInstruction:'Purpose: '+families[0].versions[0].content.purpose};
  else if(url.endsWith('/binding/list'))data=body.skillId?bindingRows.filter(row=>row.skillId===body.skillId):bindingRows.filter(row=>row.scopeType===body.scopeType&&row.scopeKey===body.scopeKey);
  else if(url.endsWith('/binding/save')){bindingRows.push(body);data=body;}
  else if(url.endsWith('/binding/remove')){bindingRows.splice(bindingRows.findIndex(row=>row.scopeKey===body.scopeKey&&row.skillType===body.skillType),1);data={removed:true};}
  else if(url.endsWith('/builder/reverse-compatibility'))data={available:false,message:'当前没有可执行的 Reverse Prompt Capability'};
  else throw Error(url);return{data};};
 const f=mount(t,component('components/SkillLibrary.vue',post));await settle();f.button('新建 Skill').click();await settle();
 f.input(f.el.querySelector('input[placeholder="image-prompt.tech-product-cinematic"]'),'image-prompt.tech-product-cinematic');
 f.input(f.el.querySelector('input[placeholder="科技产品电影感图片 Prompt"]'),'科技产品电影感图片 Prompt');
 f.button('保存 Draft V1').click();await settle();
 assert.equal(families.length,1);assert.equal(families[0].versions[0].status,'DRAFT');
 const purpose=[...f.el.querySelectorAll('textarea')].find(node=>node.parentElement.textContent.includes('用途'));
 f.input(purpose,'Create a full cinematic product image prompt');
 const rules=[...f.el.querySelectorAll('textarea')].find(node=>node.parentElement.textContent.includes('规则'));
 f.input(rules,'Preserve real UI pixels');
 assert.equal(f.button('人工激活').disabled,false,f.el.textContent);f.button('人工激活').click();await settle();
 assert.equal(families[0].versions[0].status,'ACTIVE',JSON.stringify(calls.map(call=>call.url)));assert.equal(families[0].versions[0].content.rules[0],'Preserve real UI pixels');
 f.button('预览 Runtime Skill').click();await settle();assert.match(f.el.textContent,/Purpose: Create a full cinematic/);
 f.button('Bindings').click();await settle();
 f.input([...f.el.querySelectorAll('input[type=number]')].find(node=>node.parentElement.textContent.includes('项目 ID')), '7');
 const overrideOnly=f.el.querySelector('input[type=checkbox]');overrideOnly.checked=true;overrideOnly.dispatchEvent(new Event('change',{bubbles:true}));
 f.input([...f.el.querySelectorAll('textarea')].find(node=>node.parentElement.textContent.includes('局部 Override')), 'Brighter');
 f.button('保存绑定').click();await settle();
 assert.equal(bindingRows[0].skillId,null);assert.match(f.el.textContent,/仅 Override/);
 f.button('解除').click();await settle();assert.equal(bindingRows.length,0);
 f.button('从参考图创建 Skill').click();await settle();assert.match(f.el.textContent,/当前没有可执行的 Reverse Prompt Capability/);
 assert.equal(calls.some(call=>call.url.endsWith('/builder/reverse-prompt')),false);
});

test('Advertisement storyboard explains V1, uses override-only Shot binding, previews full Compile before Apply, and upgrades only on human click',async t=>{
 const calls=[],applied=[];let projectVersion='v1';
 const post=async(url,body)=>{calls.push({url,body:JSON.parse(JSON.stringify(body))});let data;
  if(url.endsWith('/list'))data=[{skillId:'image-prompt.tech',displayName:'Tech Prompt',skillType:'IMAGE_PROMPT',versions:[{version:'v2',status:'ACTIVE'},{version:'v1',status:'DEPRECATED'}]}];
  else if(url.endsWith('/recommend'))data={recommended:{skillId:'image-prompt.tech',skillVersion:'v2',displayName:'Tech Prompt',reason:'同类型 Active Skill'},otherCompatibleSkills:[]};
  else if(url.endsWith('/resolve'))data={skillId:'image-prompt.tech',skillVersion:projectVersion,skillStatus:projectVersion==='v1'?'DEPRECATED':'ACTIVE',resolvedFrom:{scopeType:'PROJECT',scopeKey:'project:1'},overrideChain:[{scopeType:'SHOT',scopeKey:'project:1:script:10:storyboard:5',text:'Brighter'}],resolutionTrace:[{scopeType:'PROJECT',scopeKey:'project:1',skillId:'image-prompt.tech',skillVersion:projectVersion,kind:'EXACT_SKILL',selected:true,reason:'精确绑定'},{scopeType:'SHOT',scopeKey:'project:1:script:10:storyboard:5',skillId:null,skillVersion:null,kind:'OVERRIDE_ONLY',overrideText:'Brighter',selected:false,reason:'局部覆盖'}]};
  else if(url.endsWith('/binding/list'))data=[{scopeType:'SHOT',scopeKey:'project:1:script:10:storyboard:5',skillType:'IMAGE_PROMPT',skillId:null,skillVersion:null,overrideText:'Brighter'}];
  else if(url.endsWith('/binding/save')){if(body.scopeType==='PROJECT')projectVersion=body.skillVersion;data=body;}
  else if(url.endsWith('/compile'))data={compileId:'11111111-1111-4111-8111-111111111111',currentPrompt:'Old prompt',compiledPrompt:'A complete new background prompt with real UI reserved for deterministic compositing.',resolvedSkill:{skillId:'image-prompt.tech',skillVersion:projectVersion,resolvedFrom:{scopeType:'PROJECT'},overrideChain:[{scopeType:'SHOT',text:'Brighter'}]}};
  else if(url.endsWith('/compile/apply'))data={storyboard:{id:5,prompt:'A complete new background prompt with real UI reserved for deterministic compositing.',promptSkillId:'image-prompt.tech',promptSkillVersion:projectVersion,state:'未生成'}};
  else throw Error(url);return{data};};
 const f=mount(t,component('views/production/components/ImagePromptSkill.vue',post),{projectId:1,scriptId:10,storyboardId:5,currentPrompt:'Old prompt'},{onApplied:value=>applied.push(value)});await settle();
 assert.match(f.el.textContent,/image-prompt.tech @ v1/);assert.match(f.el.textContent,/Why this Skill/);
 const override=f.el.querySelector('textarea');f.input(override,'More natural, preserve real UI');f.button('保存局部 Override').click();await settle();
 const saved=calls.find(call=>call.url.endsWith('/binding/save'));assert.equal(saved.body.scopeType,'SHOT');assert.equal(saved.body.skillId,null);assert.equal(saved.body.skillVersion,null);
 f.button('Compile Prompt').click();await settle();assert.match(f.el.textContent,/Current Prompt/);assert.match(f.el.textContent,/New Complete Prompt/);
 assert.equal(f.button('应用到 Storyboard').disabled,true);assert.equal(calls.some(call=>call.url.endsWith('/compile/apply')),false);
 const checkbox=f.el.querySelector('input[type=checkbox]');checkbox.checked=true;checkbox.dispatchEvent(new Event('change',{bubbles:true}));await settle();
 f.button('应用到 Storyboard').click();await settle();assert.equal(applied.length,1);assert.equal(applied[0].promptSkillVersion,'v1');
 f.button('人工升级项目绑定到 v2').click();await settle();assert.equal(projectVersion,'v2');
 assert.equal(calls.some(call=>call.url.endsWith('/binding/save')&&call.body.scopeType==='PROJECT'&&call.body.skillVersion==='v2'),true);
});
