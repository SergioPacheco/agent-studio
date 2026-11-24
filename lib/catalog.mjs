import {AGENTS} from './core.mjs';
export function defaults(env=process.env){
 const live=!!(env.AI_MODEL&&env.AI_API_KEY);
 return {providers:[
  {id:'claude-cli',name:'Claude Code · assinatura',type:'claude-cli',enabled:true},
  {id:'codex-cli',name:'Codex CLI · assinatura',type:'codex-cli',enabled:true},
  {id:'gemini-cli',name:'Gemini CLI · assinatura',type:'gemini-cli',enabled:true},
  ...(live?[{id:'legacy-api',name:'API configurada no .env',type:'openai',baseUrl:env.AI_BASE_URL||'https://api.openai.com/v1',keyEnv:'AI_API_KEY',enabled:true}]:[])
 ],agents:AGENTS.map(a=>({...a,kind:a.id==='maestro'?'coordinator':a.id==='revisor'?'reviewer':'worker',provider:live?'legacy-api':a.id==='scout'?'gemini-cli':a.id==='revisor'?'codex-cli':'claude-cli',model:env['AI_MODEL_'+a.id.toUpperCase()]||env.AI_MODEL||'',instructions:'Atue como especialista em '+a.role+'. Seja preciso, registre evidências e respeite as aprovações.',personality:'Objetivo, colaborativo e cuidadoso.',visual:a.id,permissions:{write:!['maestro','revisor','scout'].includes(a.id),web:a.id==='scout',command:a.id==='chevron'}})),projects:[],settings:{concurrency:3,transport:'cli'}};
}
export function validateAgent(a,providers){
 if(!a||!/^[a-z][a-z0-9-]{1,31}$/.test(a.id)||!['coordinator','worker','reviewer'].includes(a.kind)||!providers.some(p=>p.id===a.provider)||typeof a.name!=='string'||!a.name.trim()||a.name.length>60||typeof a.role!=='string'||a.role.length>100||!/^#[0-9a-f]{6}$/i.test(a.color)||!['maestro','chevron','pixel','scout','revisor'].includes(a.visual))throw new Error('Configuração de agente inválida.');
 return {id:a.id,name:a.name.trim(),role:a.role,kind:a.kind,provider:a.provider,model:String(a.model||'').slice(0,120),color:a.color,icon:String(a.icon||'✦').slice(0,3),visual:a.visual,instructions:String(a.instructions||'').slice(0,6000),personality:String(a.personality||'').slice(0,1000),permissions:{write:!!a.permissions?.write,web:!!a.permissions?.web,command:!!a.permissions?.command}};
}
export function validateProvider(p){
 if(!p||!/^[a-z][a-z0-9-]{1,40}$/.test(p.id)||!['claude-cli','codex-cli','gemini-cli','openai','anthropic','gemini'].includes(p.type)||typeof p.name!=='string'||p.name.length>80)throw new Error('Provedor inválido.');
 const result={id:p.id,name:p.name,type:p.type,enabled:p.enabled!==false};
 if(!p.type.endsWith('-cli')){const url=new URL(p.baseUrl);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('URL de provedor inválida.');if(url.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Use HTTPS para provedores remotos.');if(!/^[A-Z][A-Z0-9_]{1,80}$/.test(p.keyEnv))throw new Error('Informe o nome da variável de ambiente da chave.');result.baseUrl=p.baseUrl.replace(/\/$/,'');result.keyEnv=p.keyEnv;}
 return result;
}
