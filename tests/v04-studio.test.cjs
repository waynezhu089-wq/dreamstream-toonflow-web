const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { parse, compileTemplate } = require('@vue/compiler-sfc');
const { createPinia, setActivePinia } = require('pinia');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function source(file) { const absolute=path.resolve(root,file),module={exports:{}}; const compiled=ts.transpileModule(fs.readFileSync(absolute,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('module','exports','require',compiled)(module,module.exports,name=>name.startsWith('.')?source(path.join(path.dirname(absolute),name+'.ts')):name.startsWith('@/')?source(path.join(root,'src',name.slice(2)+'.ts')):require(name));return module.exports; }
function storage(){const map=new Map();global.sessionStorage={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)};return map;}

test('Reference Pack keeps independent purpose jobs scoped; subject previews are contained',()=>{
  const {currentDraftImageJobForPurpose,currentDraftImageJob}=source('src/views/pilot/studioDraftImageView.ts');
  const {assetPreviewFit}=source('src/views/pilot/studioPresentation.ts');
  const asset={canonicalKey:'CHAR-001',revision:1};
  const jobs=['FACE_HERO','FULL_BODY_FRONT','FULL_BODY_BACK'].map((executionPurpose,i)=>({id:String(i),projectId:9,scriptId:3,canonicalKey:'CHAR-001',sourceAssetRevision:1,executionPurpose,status:'SUCCEEDED'}));
  const draft={projectId:9,scriptId:3,stage:'WAITING_IMAGE_EXECUTOR',imageJobsByPurpose:Object.fromEntries(jobs.map(j=>[j.executionPurpose,j.id])),imageJobId:'legacy'};
  for(const j of jobs)assert.equal(currentDraftImageJobForPurpose(asset,draft,jobs,j.executionPurpose),j);
  jobs[0].status='FAILED';assert.equal(currentDraftImageJobForPurpose(asset,draft,jobs,'FULL_BODY_FRONT').status,'SUCCEEDED');
  assert.equal(currentDraftImageJobForPurpose(asset,{...draft,projectId:10},jobs,'FACE_HERO'),null);
  assert.equal(currentDraftImageJobForPurpose({...asset,revision:2},draft,jobs,'FACE_HERO'),null);
  assert.equal(currentDraftImageJob(asset,draft,[{id:'legacy',...asset,sourceAssetRevision:1,status:'SUCCEEDED'}]).id,'legacy');
  for(const assetKind of ['HUMAN_CHARACTER','CREATURE','PROP','VEHICLE','CELESTIAL','MATERIAL_FX','UNKNOWN'])assert.equal(assetPreviewFit({assetKind}),'contain');
  assert.equal(assetPreviewFit({assetKind:'ENVIRONMENT'}),'cover');
  const workspace=read('src/views/pilot/StudioWorkspace.vue'),drawer=read('src/views/pilot/StudioAssetDrawer.vue');
  assert.match(workspace,/:class="assetPreviewFit\(item.asset\) === 'cover' \? 'asset-preview-cover' : 'asset-preview-contain'"/);
  assert.match(workspace,/\.asset-visual\{height:125px;overflow:hidden;display:flex;align-items:center;justify-content:center\}/);
  assert.match(drawer,/\.visual img\{[^}]*object-fit:contain/);
  assert.match(workspace,/if\(token!==generation\)return;if\(executionPurpose\)/);
  for(const name of ['StudioWorkspace','StudioAssetDrawer']){const sfc=parse(read(`src/views/pilot/${name}.vue`));assert.equal(compileTemplate({source:sfc.descriptor.template.content,filename:name+'.vue',id:name}).errors.length,0);}
});

test('OPT-028 draft image view only displays a current scoped job and restores its status from persisted identity',()=>{
  const {currentDraftImageJob,draftImageStatus}=source('src/views/pilot/studioDraftImageView.ts');
  const asset={canonicalKey:'CHAR-001',revision:2};
  const draft={imageJobId:'job-current',stage:'WAITING_IMAGE_EXECUTOR'};
  const statuses=['QUEUED','RUNNING','SUCCEEDED','FAILED'];
  const labels=['排队中','生成中','草图已生成','生成失败'];
  for(let i=0;i<statuses.length;i++){
    const job={id:'job-current',canonicalKey:'CHAR-001',sourceAssetRevision:2,status:statuses[i]};
    assert.equal(draftImageStatus(currentDraftImageJob(asset,draft,[job])),labels[i]);
  }
  assert.equal(currentDraftImageJob(asset,draft,[{id:'job-current',canonicalKey:'CHAR-001',sourceAssetRevision:1,status:'SUCCEEDED'}]),null,'old asset revision cannot become current');
  assert.equal(currentDraftImageJob(asset,draft,[{id:'job-current',canonicalKey:'FX-001',sourceAssetRevision:2,status:'SUCCEEDED'}]),null,'other asset cannot become current');
  assert.equal(currentDraftImageJob(asset,{...draft,imageJobId:null},[{id:'job-current',canonicalKey:'CHAR-001',sourceAssetRevision:2,status:'SUCCEEDED'}]),null,'new draft package cannot inherit old output');
  const studio=read('src/views/pilot/StudioWorkspace.vue');
  assert.match(studio,/\/studio\/draft-image\/jobs/);assert.match(studio,/\/studio\/artifact\/\$\{current.projectId\}/);
  assert.match(studio,/token===generation/,'late fetch cannot install an image after scope change');
});

test('OPT-028B Studio selects the subject-only profile but reuses the existing image job and card pipeline',()=>{
  const studio=read('src/views/pilot/StudioWorkspace.vue');
  const template=parse(studio).descriptor.template.content;
  assert.match(template,/Z_IMAGE_TURBO_SUBJECT_DRAFT_V1/);
  assert.match(template,/Z-Image Turbo · 人物主视图实验/);
  assert.match(template,/仅生成单人人物主视图；不会生成三视图/);
  assert.match(studio,/\/studio\/executor\/comfy\/test[\s\S]*?profile:executor\.profile/);
  assert.match(studio,/\/studio\/executor\/comfy\/configure[\s\S]*?profile:executor\.profile/);
  assert.match(studio,/\/studio\/executor\/comfy\/current/);
  assert.match(studio,/currentDraftImageJob\(item\.asset,item\.draftPackage,imageJobs\.value,scope\(\)\)/);
  assert.match(studio,/\/studio\/draft-image\/enqueue/);
  assert.match(studio,/job\.status!=='SUCCEEDED'/);
  assert.match(studio,/draftImages\.value\[job\.id\]=URL\.createObjectURL\(blob\)/);
  assert.match(studio,/@prepare-confirmed="prepareConfirmedSelected"/);
  assert.match(studio,/Number\(spec\.sourceAssetRevision\)===Number\(item\.asset\.revision\)/);
  assert.match(read('src/views/pilot/StudioAssetDrawer.vue'),/准备已确认视觉规格（不调用模型）/);
});

test('OPT-028B confirmed CHAR visual spec compiles into the existing draft package without calling the model',async()=>{
  const {runStudioAssetDraftPipeline}=source('src/views/pilot/studioAssetDraftPipeline.ts');
  const packages={},asset={canonicalKey:'CHAR-001',name:'男孩',revision:3,status:'ACTIVE',sourcePolicy:'AI_ALLOWED',category:'CHAR',assetKind:'HUMAN_CHARACTER'};
  const spec={assetKind:'HUMAN_CHARACTER',visualIdentitySummary:'A slim young boy'};
  let modelCalls=0,compileCalls=0;
  const result=await runStudioAssetDraftPipeline({projectId:12,scriptId:4,assets:[asset],
    visualSpecs:[{canonicalKey:'CHAR-001',sourceAssetRevision:3,revision:2,effectiveStatus:'CONFIRMED',spec}],
    proposals:{},packages,propose:async()=>{modelCalls++;throw new Error('model must not be called');},
    compile:async items=>{compileCalls++;assert.deepEqual(items,[{canonicalKey:'CHAR-001',sourceAssetRevision:3,spec}]);
      return {candidates:[{canonicalKey:'CHAR-001',generationIntent:'CHARACTER_TURNAROUND',draftPromptIR:{identity:'boy'},draftRenderedPrompt:{text:'A slim young boy.'},previewPlan:{},completenessIssues:[]}],failures:[]};},
    isCurrent:()=>true,onVisual:()=>{},onPackage:value=>{packages[value.canonicalKey]=value;},onProgress:()=>{}});
  assert.equal(result.aborted,false);assert.equal(modelCalls,0);assert.equal(compileCalls,1);
  assert.equal(packages['CHAR-001'].stage,'WAITING_IMAGE_EXECUTOR');
  assert.equal(packages['CHAR-001'].visualSource,'CONFIRMED');
});

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
  assert.doesNotMatch(parse(studio).descriptor.template.content,/\/agent\/action-proposal|actionInstruction|agent-action textarea|提出受控修改/);
  const agent=read('src/views/pilot/ProjectAgentPanel.vue');
  assert.match(agent,/\/v04\/agent\/studio-turn/);
  assert.match(studio,/:studio-mode="true"/);
});

test('Studio has one Agent composer, a scoped proposal card and no duplicate action input',()=>{
  const studio=read('src/views/pilot/StudioWorkspace.vue');
  const panel=read('src/views/pilot/ProjectAgentPanel.vue');
  const template=parse(studio).descriptor.template.content;
  assert.equal((template.match(/<ProjectAgentPanel\b/g)||[]).length,1);
  assert.doesNotMatch(template,/actionInstruction|提出受控修改|agent-action/);
  assert.match(template,/@modify="focusAgent"/);
  assert.match(studio,/agentPanel\.value\?\.focusComposer\(\)/);
  assert.equal((parse(panel).descriptor.template.content.match(/<textarea\b/g)||[]).length,1);
  assert.match(panel,/studioTurn \? "\/v04\/agent\/studio-turn" : "\/v04\/agent\/chat"/);
  assert.match(panel,/proposalWorkspace\.putStudioAction\(response\.data\.assistantMessageId/);
  assert.match(panel,/studioActionFor\(m\)/);
  assert.match(panel,/acceptStudioProposal/);
  assert.match(panel,/request\.files\.length === 0/,'image messages retain the attachment/vision route');
  assert.match(panel,/own !== generation/,'late results cannot enter a switched project');
});

test('Studio layout defaults, clamps and preferences survive project changes without production writes',()=>{
  const { defaultStudioLayout, mainBounds, verticalBounds, drawerBounds, readStudioLayout, saveStudioLayout, studioLayoutKey, clamp }=source('src/views/pilot/studioLayout.ts');
  const map=new Map(),store={getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};
  assert.deepEqual(readStudioLayout(store),{mainSplitRatio:58,leftVerticalSplitRatio:62,assetDrawerWidth:440});
  assert.equal(clamp(10,mainBounds(1000).min,mainBounds(1000).max),42);
  assert.equal(clamp(90,mainBounds(1000).min,mainBounds(1000).max),65.3);
  assert.ok(Math.abs(clamp(0,verticalBounds(800).min,verticalBounds(800).max)-27.5)<.001);
  assert.ok(Math.abs(clamp(100,verticalBounds(800).min,verticalBounds(800).max)-49.125)<.001);
  assert.deepEqual(drawerBounds(1200),{min:320,max:780});
  const changed={mainSplitRatio:64,leftVerticalSplitRatio:55,assetDrawerWidth:500};
  saveStudioLayout(changed,store);assert.deepEqual(readStudioLayout(store),changed);
  assert.equal(map.has(studioLayoutKey),true);
  map.set(studioLayoutKey,JSON.stringify({mainSplitRatio:999,leftVerticalSplitRatio:'bad',assetDrawerWidth:-1}));
  assert.deepEqual(readStudioLayout(store),defaultStudioLayout);
  const studio=read('src/views/pilot/StudioWorkspace.vue');
  assert.match(studio,/mainResize\.cancel\(\);verticalResize\.cancel\(\)/,'scope switch ends active drag');
  assert.match(studio,/@media\(max-width:999px\)/,'narrow view stacks panes');
  assert.doesNotMatch(read('src/views/pilot/studioLayout.ts'),/axios|fetch|project\/apply/);
});

test('resizable separator supports pointer capture, keyboard, reset and clean release',()=>{
  const file='src/views/pilot/useResizablePane.ts';
  const code=ts.transpileModule(read(file),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const module={exports:{}},listeners=new Map();
  global.document={body:{style:{userSelect:'text'}}};
  global.window={addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name)=>listeners.delete(name)};
  new Function('module','exports','require',code)(module,module.exports,name=>name==='vue'?{onBeforeUnmount:()=>{}}:source('src/views/pilot/studioLayout.ts'));
  const value={value:58};
  let captured=false;
  const handle={setPointerCapture:()=>{captured=true;},hasPointerCapture:()=>captured,releasePointerCapture:()=>{captured=false;}};
  const split=module.exports.useResizablePane({value,defaultValue:58,axis:'x',bounds:()=>({min:42,max:65}),measure:event=>event.clientX/10});
  const event={button:0,pointerId:7,currentTarget:handle,clientX:620,preventDefault(){},stopPropagation(){}};
  split.pointerdown(event);assert.equal(captured,true);assert.equal(document.body.style.userSelect,'none');
  split.pointermove(event);assert.equal(value.value,62);
  split.keydown({key:'ArrowRight',preventDefault(){},stopPropagation(){}});assert.equal(value.value,64);
  split.pointermove({...event,clientX:900});assert.equal(value.value,65);
  split.reset();assert.equal(value.value,58);
  split.pointercancel();assert.equal(captured,false);assert.equal(document.body.style.userSelect,'text');assert.equal(listeners.size,0);
  delete global.document;delete global.window;
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
  delete store.entries['10:1'].studioActions; // Existing open tabs can hold the older in-memory shape.
  assert.deepEqual(store.current().studioActions,{});
  store.putStudioAction('message-1',{summary:'调整男孩视觉规格'});
  assert.equal(store.current().studioActions['message-1'].handled,false);
  assert.equal(store.isFresh('CHAR-001',3),true);assert.equal(store.isFresh('CHAR-001',4),false);
  store.setScope(10,2);assert.deepEqual(Object.keys(store.current().visualSpecProposals),[]);
  store.setScope(11,1);assert.deepEqual(Object.keys(store.current().visualSpecProposals),[]);
  store.setScope(10,1);assert.equal(store.current().visualSpecProposals['CHAR-001'].spec.name,'draft');
  await require('vue').nextTick();
  const serialized=sessionStorage.getItem('v04ProposalWorkspace:v1:10:1');assert.match(serialized,/sourceAssetRevision/);
  assert.doesNotMatch(read('src/stores/v04ProposalWorkspace.ts'),/axios\.post|\/visual-spec\/apply/);
  assert.match(read('src/views/pilot/VisualSpecPanel.vue'),/workspace\.putVisual/);
});

test('existing session NEEDS_ATTENTION drafts migrate without losing outputs or calling a model',async()=>{
  const map=storage(),key='v04ProposalWorkspace:v1:10:1';
  const old={projectId:10,scriptId:1,canonicalKey:'CHAR-001',sourceAssetRevision:3,visualSource:'PROPOSAL',sourceVisualRevision:null,
    visualSpecDraft:{visualIdentitySummary:'Boy'},diagnostics:{normalizationWarnings:[{path:'primaryPalette',code:'SCALAR_TO_LIST'}],
      qualityWarnings:[],completenessIssues:[]},generationIntent:'CHARACTER_TURNAROUND',
    draftPromptIR:{identityBlock:{canonicalKey:'CHAR-001'}},draftRenderedPrompt:{text:'Boy character'},
    previewPlan:{previewKind:'CHARACTER'},stage:'NEEDS_ATTENTION',error:null};
  map.set(key,JSON.stringify({studioAssetDraftPackages:{'CHAR-001':old}}));
  setActivePinia(createPinia());const {useV04ProposalWorkspace}=source('src/stores/v04ProposalWorkspace.ts');
  const store=useV04ProposalWorkspace();store.setScope(10,1);
  assert.equal(store.current().studioAssetDraftPackages['CHAR-001'].stage,'WAITING_IMAGE_EXECUTOR');
  assert.deepEqual(store.current().studioAssetDraftPackages['CHAR-001'].visualSpecDraft,old.visualSpecDraft);
  assert.deepEqual(store.current().studioAssetDraftPackages['CHAR-001'].draftPromptIR,old.draftPromptIR);
  assert.deepEqual(store.current().studioAssetDraftPackages['CHAR-001'].diagnostics,old.diagnostics);
  await require('vue').nextTick();
  assert.equal(JSON.parse(map.get(key)).studioAssetDraftPackages['CHAR-001'].stage,'WAITING_IMAGE_EXECUTOR');
  setActivePinia(createPinia());const restored=useV04ProposalWorkspace();restored.setScope(10,1);
  assert.equal(restored.current().studioAssetDraftPackages['CHAR-001'].stage,'WAITING_IMAGE_EXECUTOR');
  assert.doesNotMatch(read('src/stores/v04ProposalWorkspace.ts'),/axios|fetch|\/visual-spec\/propose/);
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

test('legacy MAIN_PREVIEW recovers newest valid persisted job without session draft',()=>{
 const {currentDraftImageJob:find}=source('src/views/pilot/studioDraftImageView.ts');
 const asset={canonicalKey:'CHAR-001',revision:2},scope={projectId:9,scriptId:3};
 const job=(id,extra={})=>({id,...scope,canonicalKey:'CHAR-001',sourceAssetRevision:2,status:'SUCCEEDED',executionPurpose:'SUBJECT_MAIN_PREVIEW',outputs:[{artifactId:id,role:'MAIN_PREVIEW'}],...extra});
 const valid=job('latest');
 assert.equal(find(asset,{...scope,imageJobId:'exact',stage:'WAITING_IMAGE_EXECUTOR'},[valid,job('exact')]).id,'exact');
 assert.equal(find(asset,null,[valid,job('older')],scope),valid);
 assert.equal(find(asset,null,[job('null',{executionPurpose:null})],scope).id,'null');
 const excluded=['STALE','CANCELLED'].map(status=>job(status,{status}));
 for(const executionPurpose of ['FACE_HERO','FULL_BODY_FRONT','FULL_BODY_BACK','TURNAROUND_SHEET'])excluded.push(job(executionPurpose,{executionPurpose}));
 excluded.push(job('old-sheet',{executionPurpose:null,outputs:[{artifactId:'sheet',role:'TURNAROUND_SHEET'}]}));
 assert.equal(find(asset,null,[...excluded,valid],scope),valid);
 assert.equal(find(asset,null,[valid],{...scope,scriptId:4}),null);
 assert.equal(find({...asset,revision:3},null,[valid],scope),null);
 for(const status of ['QUEUED','RUNNING','SUCCEEDED','FAILED'])assert.equal(find(asset,null,[job(status,{status})],scope).status,status);
 assert.equal(find(asset,{...scope,imageJobId:'missing',stage:'WAITING_IMAGE_EXECUTOR'},[valid],scope),null);
});

test('subject thumbnails use intrinsic contain sizing and environments use separate cover class',()=>{
 const {assetPreviewFit}=source('src/views/pilot/studioPresentation.ts');
 const workspace=read('src/views/pilot/StudioWorkspace.vue');
 const sfc=parse(workspace),css=sfc.descriptor.styles.map(s=>s.content).join('\n');
 const contain=css.match(/\.asset-preview-contain\{([^}]+)\}/)[1];
 const cover=css.match(/\.asset-preview-cover\{([^}]+)\}/)[1];
 for(const rule of ['display:block','max-width:100%','max-height:100%','width:auto','height:auto','object-fit:contain','object-position:center'])assert.ok(contain.split(';').includes(rule),rule);
 for(const rule of ['display:block','width:100%','height:100%','object-fit:cover','object-position:center'])assert.ok(cover.split(';').includes(rule),rule);
 assert.doesNotMatch(contain,/(?:^|;)width:100%|(?:^|;)height:100%/);
 assert.doesNotMatch(css,/\.asset-visual\s+img\s*\{/);
 const image=sfc.descriptor.template.content.match(/<img v-if="imageFor\(item\)"[^>]+>/)[0];
 const classExpression=image.match(/:class="([^"]+)"/)[1];
 const classFor=new Function('assetPreviewFit','item','return '+classExpression);
 for(const assetKind of ['HUMAN_CHARACTER','CREATURE','PROP','VEHICLE'])assert.equal(classFor(assetPreviewFit,{asset:{assetKind}}),'asset-preview-contain');
 assert.equal(classFor(assetPreviewFit,{asset:{assetKind:'ENVIRONMENT'}}),'asset-preview-cover');
 assert.doesNotMatch(image,/:style=/);
});
