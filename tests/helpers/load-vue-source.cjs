const fs=require('node:fs'),path=require('node:path'),ts=require('typescript'),{parse,compileScript}=require('vue/compiler-sfc');
function loadVueSource(filename,external=require,cache=new Map()){
 const absolute=path.resolve(filename.endsWith('.vue')||filename.endsWith('.ts')?filename:filename+'.ts');
 if(cache.has(absolute))return cache.get(absolute).exports;
 const module={exports:{}};cache.set(absolute,module);
 const input=fs.readFileSync(absolute,'utf8');
 const source=absolute.endsWith('.vue')?compileScript(parse(input,{filename:absolute}).descriptor,{id:path.basename(absolute),inlineTemplate:true}).content:input;
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>name.startsWith('.')?loadVueSource(path.resolve(path.dirname(absolute),name),external,cache):external(name),module,module.exports);
 return module.exports;
}
module.exports={loadVueSource};
