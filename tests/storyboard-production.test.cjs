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
 const token={projectId:1,scriptId:10,generation:1};
 const handler=socketHandler('addStoryboard',{storyboardProductionFields,flowData,addStoryboardInfo:async(items,scope)=>{sent={items,scope};return [{...items[0],id:9}];},throttledFn:()=>{},socketUnit:()=>token,isCurrentUnit:()=>true,useStoryboardRevision:()=>({state:{mode:'LEGACY'}}),$t:x=>x});
 await handler({...spec,projectId:1,scriptId:10,prompt:'shot',duration:3,videoDesc:'screen',shouldGenerateImage:'false',associateAssetsIds:[6]},()=>{});
 assert.deepEqual(sent.scope,token);assert.deepEqual(storyboardProductionFields(sent.items[0]),spec);assert.equal(sent.items[0].shouldGenerateImage,0);
 assert.equal(sent.items[0].primaryAssetId,6);assert.deepEqual(sent.items[0].referenceAssetIds,[4,5]);assert.equal(flowData.value.storyboard[0].id,9);
});
test('actual replace forwards per-shot modes and server response without filtering metadata',async()=>{
 const flowData={value:{storyboard:[]}};let sent;
 const token={projectId:1,scriptId:10,generation:1};
 const handler=socketHandler('replaceStoryboard',{axios:{post:async(url,body)=>{sent=body;return {data:body.data};}},socketUnit:()=>token,isCurrentUnit:()=>true,flowData,setFlowData:async()=>{},useStoryboardRevision:()=>({state:{mode:'LEGACY'}})});
 await handler({projectId:1,scriptId:10,items:[{...spec,id:10}]},()=>{});assert.deepEqual(sent,{projectId:1,scriptId:10,data:[{...spec,id:10}]});assert.deepEqual(flowData.value.storyboard[0],{...spec,id:10});
});
test('legacy batch add uses captured scope and returns exact production metadata without cross-unit local mutation',async()=>{
 const before={prompt:'p',duration:3,videoDesc:'v',...spec},after={...before,id:9,primaryAssetId:null,referenceAssetIds:[],referenceAssetGroupIds:[],productionMode:'AI_TEXT_TO_IMAGE'};
 const token={projectId:1,scriptId:10,generation:1};let body;
 const declaration=find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='addStoryboardInfo');
 const fn=new Function('axios','isCurrentUnit',compile(declaration)+';return addStoryboardInfo;')({post:async(_url,value)=>{body=value;return {data:[after]};}},()=>true);
 const result=await fn([before],token);assert.deepEqual(body,{projectId:1,scriptId:10,data:[before]});
 assert.deepEqual(storyboardProductionFields(result[0]),storyboardProductionFields(after));
 assert.deepEqual(storyboardProductionFields({shouldGenerateImage:1,associateAssetsIds:[6]}),{});
});
test('B1 local IMAGE_PROMPT Apply updates only execution fields and preserves semantic prompt',()=>{
 const vue=require('vue/compiler-sfc');
 const file=path.join(root,'src/views/production/node/storyboard.vue');
 const script=vue.parse(fs.readFileSync(file,'utf8'),{filename:file}).descriptor.scriptSetup.content;
 const syntax=ts.createSourceFile(file,script,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const fn=syntax.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='applySkillPrompt');assert.ok(fn);
 const row={id:9,prompt:'Reviewed semantic intent',imagePrompt:null,filePath:'/previous.png',state:'已完成',promptSkillId:null};
 const update=new Function('storyboard',compile(fn.getText(syntax))+';return applySkillPrompt;')({value:[row]});
 update({id:9,prompt:'Must not replace semantics',imagePrompt:'Detailed execution prompt',promptSkillId:'image.method',promptSkillVersion:'v1',filePath:''});
 assert.equal(row.prompt,'Reviewed semantic intent');assert.equal(row.imagePrompt,'Detailed execution prompt');assert.equal(row.filePath,'/previous.png');assert.equal(row.state,'已完成');assert.equal(row.promptSkillId,'image.method');
});
