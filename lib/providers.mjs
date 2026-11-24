import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {command} from './process.mjs';
import {parseJSON} from './core.mjs';
export function cliArgs(type,model){
 const extra=model?['--model',model]:[];
 if(type==='claude-cli')return ['-p','--output-format','json','--tools','','--strict-mcp-config','--disallowedTools','mcp__*','--no-session-persistence',...extra];
 if(type==='codex-cli')return ['exec','--ignore-user-config','--ignore-rules','--sandbox','read-only','--ephemeral','--skip-git-repo-check','--json','-c','features.shell_tool=false','-c','features.unified_exec=false',...extra,'-'];
 if(type==='gemini-cli')return ['--output-format','json','--approval-mode','plan',...extra,'-p','Respond only to the conversation supplied on standard input. Do not use native tools.'];
 throw new Error('CLI desconhecida.');
}
export function decodeCLI(type,stdout){
 if(type==='codex-cli'){
  const events=stdout.split('\n').filter(Boolean).map(line=>{try{return JSON.parse(line);}catch{return null;}});
  const failed=events.find(e=>e?.type==='turn.failed'||e?.type==='error');if(failed)throw new Error('Codex não concluiu a chamada. Confira login e limites no terminal.');
  const text=events.filter(e=>e?.type==='item.completed'&&e.item?.type==='agent_message').map(e=>e.item.text).join('\n');
  if(!text)throw new Error('Codex não retornou uma mensagem final JSONL reconhecida.');return text;
 }
 const data=JSON.parse(stdout);if(data.is_error||data.error)throw new Error('CLI recusou a chamada. Confira autenticação e limites no terminal.');
 const text=type==='claude-cli'?data.result:data.response;if(typeof text!=='string')throw new Error('Saída da CLI sem resposta final.');return text;
}
function checkMessage(msg){
 if(!msg||typeof msg!=='object'||(msg.content!=null&&typeof msg.content!=='string')||(msg.tool_calls&&!Array.isArray(msg.tool_calls)))throw new Error('Resposta do modelo inválida.');
 if((msg.tool_calls?.length||0)>12)throw new Error('Máximo de 12 ferramentas por rodada.');
 for(const c of msg.tool_calls||[])if(!c.id||typeof c.function?.name!=='string'||typeof c.function.arguments!=='string')throw new Error('Chamada de ferramenta inválida.');
 return {role:'assistant',content:msg.content??null,...(msg.tool_calls?.length?{tool_calls:msg.tool_calls}:{})};
}
export class ProviderRouter{
 constructor({catalog,env=process.env,processRunner=command,fetcher=fetch}){this.catalog=catalog;this.env=env;this.processRunner=processRunner;this.fetcher=fetcher;}
 agent(id,run){const list=run?.team||this.catalog.agents;const a=list.find(a=>a.id===id);if(!a)throw new Error('Agente não encontrado: '+id);return a;}
 async call({agent:agentId,run,messages,tools,signal}){
  const a=this.agent(agentId,run),p=(run?.providers||this.catalog.providers).find(p=>p.id===a.provider);
  if(!p?.enabled)throw new Error('Provedor desabilitado ou ausente: '+a.provider);
  const started=Date.now();let msg,tokens=0;
  if(p.type.endsWith('-cli')){
   const dir=await mkdtemp(join(tmpdir(),'agent-studio-cli-'));
   try{
    const env={OPENAI_API_KEY:'',CODEX_API_KEY:'',ANTHROPIC_API_KEY:'',GEMINI_API_KEY:'',GOOGLE_API_KEY:''};
    if(p.type==='gemini-cli'){
     const settings=join(dir,'settings.json');await writeFile(settings,JSON.stringify({tools:{core:[]},mcp:{allowed:[]},hooks:{enabled:false},security:{disableYoloMode:true},general:{enableAutoUpdate:false}}));env.GEMINI_CLI_SYSTEM_SETTINGS_PATH=settings;
    }
    const toolRule=tools?'Return JSON {content:string|null,tool_calls?:[{id:string,type:"function",function:{name:string,arguments:string}}]}. Tool arguments must be JSON-encoded strings. Only request listed application tools. Do not execute CLI-native tools.':'Return the answer requested by the conversation. Do not execute CLI-native tools.';
    const input=JSON.stringify({protocol:toolRule,messages,tools:tools||[]});
    const executable=this.env['STUDIO_'+p.type.split('-')[0].toUpperCase()+'_CLI']||p.type.split('-')[0];
    const result=await this.processRunner(executable,cliArgs(p.type,a.model),{cwd:dir,input,signal,env,timeout:180000});
    if(result.code!==0)throw new Error(p.name+' falhou (código '+result.code+'). Faça login na CLI e verifique a versão/limites.');
    const text=decodeCLI(p.type,result.stdout);msg=tools?checkMessage(parseJSON(text)):{role:'assistant',content:text};
   }finally{await rm(dir,{recursive:true,force:true});}
  }else{
   if(!a.model)throw new Error('Selecione um modelo para '+a.name);
   const key=this.env[p.keyEnv];if(!key)throw new Error('Variável de ambiente ausente: '+p.keyEnv);
   let url,headers={'Content-Type':'application/json'},body;
   if(p.type==='anthropic'){
    url=p.baseUrl+'/messages';headers['x-api-key']=key;headers['anthropic-version']='2023-06-01';
    const converted=messages.filter(m=>m.role!=='system').map(m=>m.role==='tool'?{role:'user',content:[{type:'tool_result',tool_use_id:m.tool_call_id,content:m.content}]}:m.tool_calls?{role:'assistant',content:[...(m.content?[{type:'text',text:m.content}]:[]),...m.tool_calls.map(c=>({type:'tool_use',id:c.id,name:c.function.name,input:JSON.parse(c.function.arguments)}))]}:{role:m.role,content:m.content||''});
    body={model:a.model,max_tokens:8000,system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n'),messages:converted,...(tools?{tools:tools.map(t=>({name:t.function.name,description:t.function.description,input_schema:t.function.parameters}))}:{})};
   }else if(p.type==='gemini'){
    url=p.baseUrl+'/models/'+encodeURIComponent(a.model)+':generateContent';headers['x-goog-api-key']=key;
    const calls=new Map(messages.flatMap(m=>(m.tool_calls||[]).map(c=>[c.id,c.function.name])));
    body={systemInstruction:{parts:[{text:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n')}]},contents:messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:m.role==='tool'?[{functionResponse:{name:calls.get(m.tool_call_id)||'tool',response:{result:m.content}}}]:m.tool_calls?m.tool_calls.map(c=>({functionCall:{name:c.function.name,args:JSON.parse(c.function.arguments)}})):[{text:m.content||''}]})),...(tools?{tools:[{functionDeclarations:tools.map(t=>({name:t.function.name,description:t.function.description,parameters:t.function.parameters}))}]}:{})};
   }else{url=p.baseUrl+'/chat/completions';headers.Authorization='Bearer '+key;body={model:a.model,messages,...(tools?{tools}:{})};}
   const response=await this.fetcher(url,{method:'POST',headers,body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)});
   if(!response.ok)throw new Error(p.name+' retornou HTTP '+response.status+'. Verifique credenciais/modelo.');
   const raw=await response.text();if(raw.length>1500000)throw new Error('Resposta do provedor muito grande.');const data=JSON.parse(raw);
   if(p.type==='anthropic'){msg={content:(data.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('\n'),tool_calls:(data.content||[]).filter(c=>c.type==='tool_use').map(c=>({id:c.id,type:'function',function:{name:c.name,arguments:JSON.stringify(c.input)}}))};tokens=(data.usage?.input_tokens||0)+(data.usage?.output_tokens||0);}
   else if(p.type==='gemini'){const parts=data.candidates?.[0]?.content?.parts||[];msg={content:parts.filter(p=>p.text).map(p=>p.text).join('\n'),tool_calls:parts.filter(p=>p.functionCall).map((p,i)=>({id:'gemini-'+i+'-'+Date.now(),type:'function',function:{name:p.functionCall.name,arguments:JSON.stringify(p.functionCall.args)}}))};tokens=data.usageMetadata?.totalTokenCount||0;}
   else{msg=data.choices?.[0]?.message;tokens=data.usage?.total_tokens||0;}
   msg=checkMessage(msg);
  }
  if(run){run.usage??={calls:0,tokens:0};run.usage.calls++;run.usage.tokens+=tokens;run.usage.byProvider??={};const usage=run.usage.byProvider[p.id]??={calls:0,tokens:0,milliseconds:0};usage.calls++;usage.tokens+=tokens;usage.milliseconds+=Date.now()-started;}
  return msg;
 }
}
