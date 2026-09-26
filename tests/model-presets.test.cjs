const assert=require('node:assert/strict'),{test}=require('node:test'),fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost'});for(const k of ['window','document','Element','HTMLElement','SVGElement','Node','Event'])global[k]=dom.window[k];
const vue=require('vue'),ts=require('typescript'),{parse,compileScript}=require('vue/compiler-sfc');const root=path.resolve(__dirname,'..');
const settle=async()=>{for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,0));await vue.nextTick();}};
const empty=()=>({text:null,image:null,video:null,tts:null});
function fixture(t,projectId){
 const requests=[],presets=[{id:'one',name:'广告组合',slots:{text:'v:text',image:'v:image',video:'v:video',tts:null}}];let overrides=empty();const store={project:{id:projectId,imageModel:'',videoModel:''}};const control={before:null};
 const post=async(url,body)=>{requests.push({url,body:structuredClone(body)});if(control.before){const v=await control.before(url,body);if(v)return v;}
 if(url.endsWith('/list'))return{data:{presets:structuredClone(presets),scopes:[],options:['text','image','video','tts'].map(type=>({value:'v:'+type,type,label:type+' choice'}))}};
 if(url.endsWith('/save')){const p={...body,id:body.id||'two'};presets.push(p);return{data:p};}
 if(url.endsWith('/default'))return{data:{}};
 if(url.endsWith('/project'))overrides=body.presetId?{...presets[0].slots}:{...overrides,...body.slots};
 return{data:{models:overrides,overrides,sources:{image:'project',video:'project'}}};};
 const file=path.join(root,'src/components/ModelPresets.vue');const code=ts.transpileModule(compileScript(parse(fs.readFileSync(file,'utf8'),{filename:file}).descriptor,{id:'presets',inlineTemplate:true}).content,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 const module={exports:{}};new Function('require','module','exports',code)(name=>name==='@/utils/axios'?{post}:name==='@/stores/setting'?()=>({}):name==='@/stores/project'?()=>store:require(name),module,module.exports);
 const props=vue.reactive({projectId}),container=document.createElement('div');document.body.append(container);const app=vue.createApp({render:()=>vue.h(module.exports.default,props)});app.mount(container);t.after(()=>{app.unmount();container.remove();});
 const input=async(label,value)=>{const el=container.querySelector(`[aria-label="${label}"]`);assert.ok(el,label);el.value=value;el.dispatchEvent(new Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await settle();};
 const click=async text=>{const b=[...container.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert.ok(b,text);b.click();await settle();};return{requests,container,input,click,props,control};
}
test('preset UI saves entire multi-model combination and empty preset without generation',async t=>{
 const f=fixture(t);await settle();await f.input('预设名称','通用组合');for(const [label,value] of [['文本模型','v:text'],['图片模型','v:image'],['视频模型','v:video'],['音频/TTS模型','v:tts']])await f.input(label,value);await f.click('保存整套预设');
 assert.deepEqual(f.requests.find(r=>r.url.endsWith('/save')).body.slots,{text:'v:text',image:'v:image',video:'v:video',tts:'v:tts'});
 await f.click('新建预设');await f.input('预设名称','稍后配置');await f.click('保存整套预设');assert.deepEqual(f.requests.filter(r=>r.url.endsWith('/save')).at(-1).body.slots,empty());
 await f.input('广告默认预设','one');await f.click('保存默认预设');assert.ok(f.requests.some(r=>r.body.scope==='profile:advertisement'&&r.body.presetId==='one'));
});
test('project UI applies entire preset; changing image sends only image and retains video',async t=>{
 const f=fixture(t,1);await settle();await f.input('选择预设','one');await f.click('应用整个预设');assert.deepEqual(f.requests.find(r=>r.body.presetId).body,{projectId:1,presetId:'one'});
 await f.input('图片模型','');await f.click('保存图片模型');assert.deepEqual(f.requests.at(-1).body,{projectId:1,slots:{image:null}});assert.equal(f.container.querySelector('[aria-label="视频模型"]').value,'v:video');
});
test('project switch ignores delayed old project model resolution',async t=>{
 const f=fixture(t,1);await settle();let resolve;f.control.before=(url,body)=>url.endsWith('/resolve')&&body.projectId===2?new Promise(r=>resolve=r):null;
 f.props.projectId=2;await settle();f.props.projectId=3;await settle();resolve({data:{models:{image:'v:image'},overrides:{image:'v:image'},sources:{image:'project'}}});await settle();assert.equal(f.container.querySelector('[aria-label="图片模型"]').value,'');
});
function sourceFunction(file,name,bindings){const source=parse(fs.readFileSync(path.join(root,file),'utf8')).descriptor.scriptSetup.content;const ast=ts.createSourceFile(file+'.ts',source,ts.ScriptTarget.Latest,true);const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name.text===name);const code=ts.transpileModule(fn.getText(ast),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function(...Object.keys(bindings),code+';return '+name)(...Object.values(bindings));}
test('actual create/edit handler permits model-free advertisement Brief but keeps short-drama checks',()=>{
 const warnings=[],emits=[];window.$message={warning:x=>warnings.push(x)};
 const formState={value:{projectType:'general_video',type:'advertisement',name:'Ad',intro:'Brief',artStyle:'style',directorManual:'director',videoRatio:'16:9',imageModel:'',videoModel:'',imageQuality:'',mode:''}};
 const isEdit={value:false};const fn=sourceFunction('src/views/project/components/projectDialog.vue','handleOk',{formState,isEdit,emit:(...a)=>emits.push(a),resetForm:()=>{},addProjectShow:{value:true},$t:x=>x});fn();assert.equal(emits[0][0],'add');isEdit.value=true;fn();assert.equal(emits[1][0],'edit');assert.equal(warnings.length,0);
 formState.value.projectType='novel';fn();assert.equal(emits.length,2);assert.match(warnings[0],/enterImageModel/);
});
test('actual open handler enters advertisement preparation without model queries; legacy still redirects to edit',async()=>{
 const requests=[],nav=[],edited=[];const item={id:'1',projectType:'general_video',type:'advertisement',imageModel:'',videoModel:''};window.$message={warning:()=>{},error:()=>{}};
 const fn=sourceFunction('src/views/project/index.vue','openProject',{allProject:{value:[item]},project:{value:null},axios:{post:async(url,body)=>{requests.push(url);return{data:{ready:false,scriptId:10}}}},router:{push:p=>nav.push(p)},openEdit:x=>edited.push(x),ensureGeneralVideoProductionUnit:async()=>({id:10}),selectAdvertisementUnit:()=>{},advertisementLocation:(path,projectId,scriptId)=>({path,projectId,scriptId}),$t:x=>x});
 await fn('1');assert.equal(nav[0].path,'/assets');assert.equal(requests.some(r=>r.includes('getModelDetail')),false);item.projectType='novel';await fn('1');assert.equal(edited.length,1);
});
test('video generation preparation checks model only at the generation tab',async()=>{
 const activeMenu={value:'preview'},warnings=[];window.$message={warning:x=>warnings.push(x)};
 const fn=sourceFunction('src/views/production/components/workbench/index.vue','changeMenu',{project:{value:{id:1,projectType:'general_video',type:'advertisement'}},activeMenu,axios:{post:async()=>{throw{message:'请先配置视频生成模型'}}},editFootage:()=>{}});
 await fn('generate');assert.equal(activeMenu.value,'preview');assert.match(warnings[0],/请先配置视频生成模型/);await fn('editVideo');assert.equal(activeMenu.value,'editVideo');
});
