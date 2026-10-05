const {test}=require('node:test');const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');const dom=new JSDOM('<div id="card"></div>');
for(const name of ['window','document','Element','HTMLElement','SVGElement','Node'])global[name]=dom.window[name];
const {createApp,h}=require('vue'),ts=require('typescript'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const transpile=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const moduleSource=fs.readFileSync(path.join(root,'src/views/pilot/studioDraftImageView.ts'),'utf8');
const mod={exports:{}};new Function('module','exports',transpile(moduleSource))(mod,mod.exports);
const {currentDraftImageJob}=mod.exports;
const studio=fs.readFileSync(path.join(root,'src/views/pilot/StudioWorkspace.vue'),'utf8');
const imageCode=studio.match(/function imageFor\(item:any\)\{([^\n]+)\}/)[0];

test('browser-session reload mounts persisted MAIN_PREVIEW with no draft and preserves image priority',()=>{
 const scope={projectId:9,scriptId:3},asset={canonicalKey:'CHAR-001',revision:2};
 const persisted=JSON.parse(JSON.stringify([{id:'main',...scope,canonicalKey:'CHAR-001',sourceAssetRevision:2,status:'SUCCEEDED',executionPurpose:null,outputs:[{artifactId:'artifact',role:'MAIN_PREVIEW'}]}]));
 const draftImages={value:{main:'/persisted-main.png',reference:'/reference.png'}},referenceImages={value:{real:'/real.png'}};
 const imageFor=new Function('draftImages','referenceImages',transpile(imageCode)+';return imageFor;')(draftImages,referenceImages);
 const restored=()=>({asset,draftPackage:null,imageJob:currentDraftImageJob(asset,null,persisted,scope),refs:[],outputPath:null});
 for(let reload=0;reload<2;reload++){
  const item=restored();const app=createApp({render:()=>imageFor(item)?h('img',{src:imageFor(item)}):h('span','三视图已规划')});
  app.mount('#card');assert.equal(document.querySelector('img').getAttribute('src'),'/persisted-main.png');app.unmount();
 }
 const item=restored();
 assert.equal(imageFor({...item,displayReferenceJob:{id:'reference'}}),'/reference.png');
 assert.equal(imageFor({...item,selectedPurpose:'FACE_HERO',referenceJobs:{FACE_HERO:{id:'reference',status:'SUCCEEDED'}}}),'/reference.png');
 assert.equal(imageFor({...item,imageJob:null,outputPath:'/review.png',refs:[{attachmentId:'real'}]}),'/review.png');
 assert.equal(imageFor({...item,imageJob:null,refs:[{attachmentId:'real'}]}),'/real.png');
});

test('OPT-029B automatic main appears on reload without draft package while confirmed baseline remains higher authority',()=>{
 const scope={projectId:9,scriptId:3},asset={canonicalKey:'PROP-001',revision:1};const jobs=[{id:'auto',...scope,canonicalKey:asset.canonicalKey,sourceAssetRevision:1,status:'SUCCEEDED',executionPurpose:'ASSET_MAIN_PREVIEW',outputs:[{role:'MAIN_PREVIEW'}]}];
 assert.equal(currentDraftImageJob(asset,null,jobs,scope).id,'auto');assert.equal(currentDraftImageJob(asset,null,jobs,{...scope,scriptId:4}),null);
 const images={value:{auto:'/auto-main.png'}},refs={value:{baseline:'/baseline.png'}};const imageFor=new Function('draftImages','referenceImages',transpile(imageCode)+';return imageFor;')(images,refs);const item={asset,imageJob:jobs[0],refs:[],imageBaselines:[],outputPath:null};assert.equal(imageFor(item),'/auto-main.png');assert.equal(imageFor({...item,baseline:{attachmentId:'baseline'}}),'/baseline.png');
});
