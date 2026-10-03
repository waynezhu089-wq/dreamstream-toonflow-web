const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { parse, compileTemplate } = require('@vue/compiler-sfc');
const { createPinia, setActivePinia } = require('pinia');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function source(file) { const module={exports:{}}; const compiled=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText; new Function('module','exports','require',compiled)(module,module.exports,require); return module.exports; }
function storage(){const map=new Map();global.sessionStorage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};return map;}

test('Studio routes, deep links and component templates are valid',()=>{
  const router=read('src/router/index.ts'),login=read('src/pages/login/index.vue'),professional=read('src/views/pilot/PilotShell.vue');
  assert.match(router,/path: "\/"[\s\S]*?redirect: "\/studio"/);
  assert.match(router,/path: "\/pilot"[\s\S]*?redirect: "\/professional"/);
  assert.match(router,/path: "\/studio"[\s\S]*?StudioWorkspace/);
  assert.match(login,/50189" \? "\/studio"/);
  assert.match(professional,/route\.query\.asset/);assert.match(professional,/route\.query\.shot/);
  assert.match(professional,/selectAsset\(found\)/);
  for(const name of ['StudioWorkspace','StudioAssetDrawer','PilotShell','VisualSpecPanel']){
    const file=`src/views/pilot/${name}.vue`,parsed=parse(read(file),{filename:file});assert.deepEqual(parsed.errors,[],file);
    assert.deepEqual(compileTemplate({source:parsed.descriptor.template.content,filename:file,id:file}).errors,[],file);
  }
  const studio=read('src/views/pilot/StudioWorkspace.vue');
  assert.match(studio,/ProjectAgentPanel/);assert.match(studio,/goProfessional\(/);
  assert.match(studio,/\/agent\/action-proposal/);
});

test('Asset World groups and statuses use current truth and do not invent images',()=>{
  const { studioGroup,studioAssetStatus,studioAssets,safeStudioImagePath }=source('src/views/pilot/studioPresentation.ts');
  const kinds=[['HUMAN_CHARACTER','主体'],['CREATURE','主体'],['VEHICLE','主体'],['ENVIRONMENT','场景'],['MATERIAL_FX','视觉系统'],['BRAND_MARK','品牌']];
  for(const [assetKind,group] of kinds)assert.equal(studioGroup({assetKind,category:'CHAR',sourcePolicy:'AI_ALLOWED'}),group);
  const brand={assetKind:'BRAND_MARK',category:'BRAND',sourcePolicy:'REAL_REQUIRED',revision:1};
  assert.equal(studioAssetStatus(brand,null,null,null,[]),'真实参考专用');
  assert.equal(studioAssetStatus(brand,null,null,null,[{}]),'正式采用');
  const boy={assetKind:'HUMAN_CHARACTER',category:'CHAR',sourcePolicy:'AI_ALLOWED',revision:2,status:'ACTIVE',canonicalKey:'CHAR-001'};
  assert.equal(studioAssetStatus(boy,null,null,null,[]),'待设计');
  assert.equal(studioAssetStatus(boy,null,null,null,[],{sourceAssetRevision:2,spec:{}}),'草案待审');
  assert.equal(studioAssetStatus(boy,null,null,null,[],{sourceAssetRevision:1,spec:{}}),'需要处理');
  assert.equal(studioAssetStatus(boy,{effectiveStatus:'CONFIRMED'},null,null,[]),'视觉规格已确认');
  assert.equal(studioAssetStatus(boy,{effectiveStatus:'CONFIRMED'},{effectiveStatus:'READY'},null,[]),'Prompt 已准备');
  assert.equal(studioAssetStatus(boy,{effectiveStatus:'CONFIRMED'},null,{previewStatus:'PLANNED'},[]),'预览待生成');
  assert.equal(studioAssetStatus(boy,{effectiveStatus:'CONFIRMED'},null,{previewFilePath:'/oss/asset/preview.png'},[]),'预览已生成');
  assert.equal(safeStudioImagePath('C:\\secret\\photo.png'),null);assert.equal(safeStudioImagePath('/oss/asset/preview.png'),'/oss/asset/preview.png');
  const state={assets:[boy,{...brand,canonicalKey:'BRAND-001',status:'ACTIVE'}],visualSpecs:[],promptBuilds:[],reviewPlans:[],agentReferences:[]};
  assert.equal(studioAssets(state,{}).length,2);assert.equal(studioAssets(state,{}).find(x=>x.group==='品牌').outputPath,null);
});

test('Proposal Workspace isolates project and unit, persists source revision only as draft',async()=>{
  storage();setActivePinia(createPinia());const {useV04ProposalWorkspace}=source('src/stores/v04ProposalWorkspace.ts');
  const store=useV04ProposalWorkspace();store.setScope(10,1);store.putVisual({canonicalKey:'CHAR-001',sourceAssetRevision:3,spec:{name:'draft'}});
  assert.equal(store.isFresh('CHAR-001',3),true);assert.equal(store.isFresh('CHAR-001',4),false);
  store.setScope(10,2);assert.deepEqual(Object.keys(store.current().visualSpecProposals),[]);
  store.setScope(11,1);assert.deepEqual(Object.keys(store.current().visualSpecProposals),[]);
  store.setScope(10,1);assert.equal(store.current().visualSpecProposals['CHAR-001'].spec.name,'draft');
  await require('vue').nextTick();
  const serialized=sessionStorage.getItem('v04ProposalWorkspace:v1:10:1');assert.match(serialized,/sourceAssetRevision/);
  assert.doesNotMatch(read('src/stores/v04ProposalWorkspace.ts'),/axios\.post|\/visual-spec\/apply/);
  assert.match(read('src/views/pilot/VisualSpecPanel.vue'),/workspace\.putVisual/);
});

test('one bulk review click sequentially confirms six clean proposals and leaves warnings, stale and failures',async()=>{
  const {confirmNormalVisuals}=source('src/views/pilot/studioBulkReview.ts');
  const keys=Array.from({length:9},(_,i)=>`CHAR-${i+1}`),calls=[],applied=[];
  const proposals=Object.fromEntries(keys.map(key=>[key,{canonicalKey:key,sourceAssetRevision:2,spec:{key}}]));
  proposals['CHAR-7'].qualityWarnings=[{path:'visualIdentitySummary'}];proposals['CHAR-8'].sourceAssetRevision=1;
  const state={assets:keys.map(canonicalKey=>({canonicalKey,revision:2,status:'ACTIVE',sourcePolicy:'AI_ALLOWED',category:'CHAR'}))};
  const result=await confirmNormalVisuals({projectId:10,scriptId:1,keys,proposals,read:async()=>state,
    preview:async body=>{calls.push(`preview:${body.canonicalKey}`);return {previewHash:'hash',issues:body.canonicalKey==='CHAR-9'?['details.hair']:[]};},
    apply:async body=>{calls.push(`apply:${body.canonicalKey}`);if(body.canonicalKey==='CHAR-3')throw Error('write rejected');},
    isCurrent:()=>true,onApplied:key=>applied.push(key)});
  assert.deepEqual([result.applied,result.needsReview,result.failed],[5,3,1]);
  assert.equal(calls.filter(x=>x.startsWith('apply:')).length,6);
  assert.deepEqual(applied,['CHAR-1','CHAR-2','CHAR-4','CHAR-5','CHAR-6']);
  assert.ok(calls.indexOf('preview:CHAR-1')<calls.indexOf('apply:CHAR-1'));
  assert.ok(calls.indexOf('apply:CHAR-1')<calls.indexOf('preview:CHAR-2'));
  assert.equal(calls.includes('preview:CHAR-7'),false);assert.equal(calls.includes('preview:CHAR-8'),false);
});

test('bulk review stops when project scope changes and does not apply late response',async()=>{
  const {confirmNormalVisuals}=source('src/views/pilot/studioBulkReview.ts');let current=true,applied=0;
  const result=await confirmNormalVisuals({projectId:1,scriptId:1,keys:['A','B'],proposals:{A:{sourceAssetRevision:1,spec:{}},B:{sourceAssetRevision:1,spec:{}}},read:async()=>({assets:[{canonicalKey:'A',revision:1,status:'ACTIVE',sourcePolicy:'AI_ALLOWED',category:'CHAR'}]}),preview:async()=>{current=false;return {previewHash:'x',issues:[]}},apply:async()=>{applied++},isCurrent:()=>current,onApplied:()=>{}});
  assert.equal(applied,0);assert.equal(result.applied,0);
});
