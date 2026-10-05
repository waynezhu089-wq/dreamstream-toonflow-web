const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadVueSource}=require('./helpers/load-vue-source.cjs');
const {assetCardReviewImages:images}=loadVueSource(path.resolve(__dirname,'../src/views/pilot/assetCardReview.ts'),require,new Map());
const job=(id,status='SUCCEEDED',artifactId=id)=>({id,status,outputs:[{artifactId}]});
const make=(kind,roles)=>({asset:{assetKind:kind},refs:[],referenceJobs:Object.fromEntries(roles.map(role=>[role,job(role)]))});
const urls=new Proxy({},{get:(_,key)=>'/'+key});
test('02B MAIN only and environment stay single; human/creature/vehicle/prop expose their exact view groups',()=>{
 assert.equal(images({...make('HUMAN_CHARACTER',[]),readyMainJob:job('main')},urls,{}).length,1);
 for(const [kind,roles] of [['HUMAN_CHARACTER',['FULL_BODY_FRONT','FACE_HERO','FULL_BODY_BACK']],['CREATURE',['HERO_3Q','SIDE_PROFILE','BACK_3Q']],['VEHICLE',['HERO_3Q','SIDE_PROFILE','REAR_3Q','DETAIL_REFERENCE']],['PROP',['HERO_3Q','SIDE_PROFILE','DETAIL_REFERENCE']]])assert.deepEqual(images(make(kind,roles),urls,{}).map(i=>i.id),roles);
 assert.equal(images({...make('ENVIRONMENT',['HERO_3Q']),readyMainJob:job('main')},urls,{}).length,1);
});
test('02B duplicate artifact is shown once and failed/stale/rejected outputs never enter gallery',()=>{
 const item=make('HUMAN_CHARACTER',['FACE_HERO','FULL_BODY_FRONT','FULL_BODY_BACK']);item.referenceJobs.FULL_BODY_FRONT.outputs[0].artifactId='FACE_HERO';assert.equal(images(item,urls,{}).length,2);item.rejectedJobIds=['FULL_BODY_BACK'];assert.equal(images(item,urls,{}).length,1);item.rejectedJobIds=[];
 item.referenceJobs.FACE_HERO.status='FAILED';item.referenceJobs.FULL_BODY_FRONT.status='STALE';item.referenceJobs.FULL_BODY_BACK.decision='REJECTED';assert.equal(images(item,urls,{}).length,0);
});
test('02B authoritative current deduplicates its reference source while preserving vehicle details',()=>{
 const item=make('VEHICLE',['HERO_3Q','SIDE_PROFILE','REAR_3Q','DETAIL_REFERENCE']);item.baseline={attachmentId:'accepted',sourceJobId:'HERO_3Q'};const result=images(item,urls,{accepted:'/accepted'});assert.equal(result.length,4);assert.equal(result[0].label,'当前版本');assert.deepEqual(result.map(i=>i.id),['accepted','SIDE_PROFILE','REAR_3Q','DETAIL_REFERENCE']);
});

test('02C hero priority prefers confirmed current, then type main, then legacy main',()=>{const human=make('HUMAN_CHARACTER',['FACE_HERO','FULL_BODY_FRONT','FULL_BODY_BACK']);assert.equal(images(human,urls,{})[0].id,'FULL_BODY_FRONT');human.baseline={attachmentId:'current'};assert.equal(images(human,urls,{current:'/current'})[0].id,'current');assert.equal(images(make('CREATURE',['SIDE_PROFILE','HERO_3Q']),urls,{})[0].id,'HERO_3Q');assert.equal(images({...make('CREATURE',[]),readyMainJob:job('main')},urls,{})[0].id,'main');});

test('02C legacy MAIN becomes hero ahead of secondary; layout gives hero majority and full height',()=>{const item={...make('CREATURE',['SIDE_PROFILE','BACK_3Q']),readyMainJob:job('main')};assert.equal(images(item,urls,{})[0].id,'main');const fs=require('node:fs'),css=fs.readFileSync(path.resolve(__dirname,'../src/views/pilot/StudioWorkspace.vue'),'utf8');assert.match(css,/card-images-3\{[^}]*62fr[^}]*38fr/);assert.match(css,/card-images-4\{[^}]*60fr[^}]*40fr/);assert.match(css,/card-images-3 .card-image-cell:first-child\{grid-row:1 \/ 3/);assert.match(css,/card-images-4 .card-image-cell:first-child\{grid-row:1 \/ 4/);});
