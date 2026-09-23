const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function compile(source){return ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;}
const mod={exports:{}};new Function('exports',compile(fs.readFileSync(path.join(root,'src/utils/storyboardProduction.ts'),'utf8')))(mod.exports);
const {storyboardProductionFields}=mod.exports;
const source=fs.readFileSync(path.join(root,'src/stores/productionAgent.ts'),'utf8'),ast=ts.createSourceFile('store.ts',source,ts.ScriptTarget.Latest,true);
function find(check){let result;function visit(n){if(check(n))result=n;ts.forEachChild(n,visit);}visit(ast);assert.ok(result);return result.getText(ast);}
function socketHandler(event,scope){const text=find(n=>ts.isCallExpression(n)&&n.expression.getText(ast)==='s.on'&&n.arguments[0].text===event);const node=ts.createSourceFile('handler.ts',text,ts.ScriptTarget.Latest,true);const call=node.statements[0].expression;const callback=call.arguments[1].getText(node);return new Function(...Object.keys(scope),'return '+compile('('+callback+')').trim().replace(/;$/,''))(...Object.values(scope));}
const spec={productionMode:'AI_REFERENCE_GENERATE',primaryAssetId:6,referenceAssetIds:[4,5],referenceAssetGroupIds:['views'],promptSkillId:'product',promptSkillVersion:'2',capabilityId:'future.reference'};
test('actual Socket add preserves seven fields through the HTTP batch payload',async()=>{
 let sent;const flowData={value:{storyboard:[]}};
 const handler=socketHandler('addStoryboard',{storyboardProductionFields,flowData,addStoryboardInfo:async items=>{sent=items;},throttledFn:()=>{},$t:x=>x});
 await handler({...spec,prompt:'shot',duration:3,videoDesc:'screen',shouldGenerateImage:'false',associateAssetsIds:[6]},()=>{});
 assert.deepEqual(storyboardProductionFields(sent[0]),spec);assert.equal(sent[0].shouldGenerateImage,0);
 assert.equal(sent[0].primaryAssetId,6);assert.deepEqual(sent[0].referenceAssetIds,[4,5]);
});
test('actual replace forwards per-shot modes and server response without filtering metadata',async()=>{
 const flowData={value:{storyboard:[]}};let sent;
 const handler=socketHandler('replaceStoryboard',{axios:{post:async(url,body)=>{sent=body;return {data:body.data};}},episodesId:{value:10},projectId:1,flowData,setFlowData:async()=>{}});
 await handler({items:[{...spec,id:10}]},()=>{});assert.deepEqual(sent,{projectId:1,scriptId:10,data:[{...spec,id:10}]});assert.deepEqual(flowData.value.storyboard[0],{...spec,id:10});
});
test('actual batch response updates production metadata; legacy fields remain absent and explicit null/empty survive',async()=>{
 const before={prompt:'p',duration:3,videoDesc:'v',...spec},after={...before,id:9,primaryAssetId:null,referenceAssetIds:[],referenceAssetGroupIds:[],productionMode:'AI_TEXT_TO_IMAGE'};
 const flowData={value:{storyboard:[before]}};
 const declaration=find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='addStoryboardInfo');
 const fn=new Function('axios','episodesId','projectId','flowData','storyboardProductionFields',compile(declaration)+';return addStoryboardInfo;')({post:async()=>({data:[after]})},{value:10},1,flowData,storyboardProductionFields);
 await fn([before]);assert.deepEqual(storyboardProductionFields(before),storyboardProductionFields(after));
 assert.deepEqual(storyboardProductionFields({shouldGenerateImage:1,associateAssetsIds:[6]}),{});
});
