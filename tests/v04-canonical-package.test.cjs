const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadVueSource}=require('./helpers/load-vue-source.cjs');
const {currentAssetPackage:pack}=loadVueSource(path.resolve(__dirname,'../src/views/pilot/assetCanonicalPackage.ts'));
const {assetCardReviewImages:gallery}=loadVueSource(path.resolve(__dirname,'../src/views/pilot/assetCardReview.ts'));
const asset={canonicalKey:'CHAR-001',revision:1,assetKind:'HUMAN_CHARACTER'},scope={projectId:9,scriptId:3};
const job=(id,stage,status='SUCCEEDED',packageId='p')=>({id,...scope,canonicalKey:asset.canonicalKey,sourceAssetRevision:1,packageId,packageStage:stage,status,updatedAt:12,outputs:[{artifactId:id}]});
test('034A reload selects same-scope package; only Klein main and same-package views enter gallery',()=>{
 const jobs=[job('draft','DRAFT_KREA'),job('main','CANONICAL_MAIN_KLEIN'),{...job('side','MULTIVIEW_KLEIN'),executionPurpose:'SIDE_PROFILE'},job('old-view','MULTIVIEW_KLEIN','SUCCEEDED','old'),job('legacy',null)];
 const p=pack(asset,jobs,scope);assert.equal(p.main.id,'main');assert.deepEqual(p.views.map(j=>j.id),['side']);
 const images=gallery({asset,canonicalPackage:p,baseline:{attachmentId:'old'},readyMainJob:jobs[4]},Object.fromEntries(jobs.map(j=>[j.id,'/'+j.id])),{old:'/old'});assert.deepEqual(images.map(i=>i.id),['main','side']);assert.equal(images[0].label,'Klein 主视图');
 assert.equal(pack(asset,jobs,{...scope,scriptId:4}),null);assert.equal(pack({...asset,revision:2},jobs,scope),null);
});
test('034A stage feedback keeps Krea hidden and never shows legacy image during package replacement',()=>{
 for(const [rows,label] of [[[job('d','DRAFT_KREA','QUEUED')],'Krea2 主视图草稿中'],[[job('d','DRAFT_KREA')],'Klein 主视图生成中'],[[job('d','DRAFT_KREA'),job('m','CANONICAL_MAIN_KLEIN')],'Klein 多视图生成中'],[[job('d','DRAFT_KREA','FAILED')],'失败，可重试']]){const p=pack(asset,rows,scope);assert.equal(p.label,label);assert.equal(gallery({asset,canonicalPackage:p,readyMainJob:job('legacy',null)},{legacy:'/legacy'},{}).some(i=>i.id==='legacy'),false);}
 const stale=pack(asset,[job('d','DRAFT_KREA','STALE'),job('m','CANONICAL_MAIN_KLEIN','STALE')],scope);assert.match(stale.label,/已过期/);assert.equal(gallery({asset,canonicalPackage:stale},{m:'/m'},{}).length,0);
});
test('034A Studio controls use bounded existing admission API and scope guard; no automatic adoption',()=>{
 const source=fs.readFileSync(path.resolve(__dirname,'../src/views/pilot/StudioWorkspace.vue'),'utf8');assert.match(fs.readFileSync(path.resolve(__dirname,'../src/views/pilot/AssetPreparationFeedback.vue'),'utf8'),/一键重新准备全部资产/);assert.match(source,/useAssetPreparationFeedback/);assert.match(source,/uuid:\(\)=>crypto.randomUUID\(\)/);assert.match(source,/async function regenerateSelected\(\)[^\n]*prepareNext\(true,key\)/);assert.match(source,/if\(token!==generation\)return;pipelineState.value=next;preparation.observe\(next\)/);assert.match(source,/currentAssetPackage\(item.asset,imageJobs.value,scope\(\)/);
});

test('034A Agent edited package reviews Klein main only, not hidden draft or automatic sibling views',()=>{const {isConversationalPackageCandidate:review}=loadVueSource(path.resolve(__dirname,'../src/views/pilot/assetCanonicalPackage.ts'));assert.equal(review({...job('main','CANONICAL_MAIN_KLEIN'),userMessageId:'message'}),true);for(const stage of ['DRAFT_KREA','MULTIVIEW_KLEIN'])assert.equal(review({...job('hidden',stage),userMessageId:'message'}),false);assert.equal(review(job('auto','CANONICAL_MAIN_KLEIN')),false);});
