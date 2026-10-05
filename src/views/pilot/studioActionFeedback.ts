import { reactive } from 'vue';
export type StudioActionState = { phase:'IDLE'|'WORKING'|'SUCCESS'|'FAILURE'; label:string; error:string };
export function useStudioActionFeedback() {
  const states=reactive<Record<string,StudioActionState>>({});let generation=0;
  const state=(key:string)=>states[key]??{phase:'IDLE' as const,label:'',error:''};
  function reset(){generation++;for(const key of Object.keys(states))delete states[key];}
  async function run(key:string,working:string,success:string,action:()=>Promise<void>,failure='这次未完成，当前版本没有改变，可以重试。'){
    if(state(key).phase==='WORKING')return false;const own=generation;
    states[key]={phase:'WORKING',label:working,error:''};
    try{await action();if(own===generation)states[key]={phase:'SUCCESS',label:success,error:''};return true;}
    catch{if(own===generation)states[key]={phase:'FAILURE',label:'未完成',error:failure};return false;}
  }
  return {states,state,run,reset};
}
