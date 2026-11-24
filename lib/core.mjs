import { createHash } from 'node:crypto';
export const AGENTS = [
 {id:'maestro',name:'Maestro',role:'Coordenação',color:'#a99aff',icon:'♛'},
 {id:'chevron',name:'Chevron',role:'Back-end',color:'#ffb28c',icon:'‹›'},
 {id:'pixel',name:'Pixel',role:'Interface',color:'#f8cf7c',icon:'▦'},
 {id:'scout',name:'Scout',role:'Pesquisa',color:'#90daca',icon:'✦'},
 {id:'revisor',name:'Revisor',role:'Qualidade',color:'#8dbbff',icon:'✓'}
];
export function safePath(value) {
 if(typeof value!=='string'||value.length>240||value.includes('\\')||value.startsWith('/')||!value.split('/').every(s=>/^[a-zA-Z0-9_.-]+$/.test(s)&&s!=='.'&&s!=='..')||value.split('/').some(s=>['.git','.studio','node_modules'].includes(s)||s.startsWith('.env'))||!(/\.(mjs|cjs|js|jsx|ts|tsx|json|html|css|scss|md|txt|java|xml|sql|yml|yaml|py|toml|properties|sh|svg)$/.test(value)||['.gitignore','Dockerfile','Makefile'].includes(value)))throw new Error('Caminho inválido: '+value);
 return value;
}
export function validatePlan(plan,allowedAgents=['chevron','pixel','scout']) {
 if(!plan || !Array.isArray(plan.tasks)||!plan.tasks.length||plan.tasks.length>8) throw new Error('Plano deve ter 1 a 8 tarefas.');
 const ids=new Set();
 for(const t of plan.tasks){
  if(!t || !/^[a-z0-9-]{1,32}$/.test(t.id)||ids.has(t.id)||!allowedAgents.includes(t.agent)||typeof t.title!=='string'||!t.title.trim()||t.title.length>300||!Array.isArray(t.dependsOn)) throw new Error('Tarefa inválida.');
  if(t.dependsOn.some(id=>!ids.has(id))) throw new Error('Dependência deve apontar para tarefa anterior.');
  ids.add(t.id);
 }
 return {summary:String(plan.summary||'Plano de execução').slice(0,1000),tasks:plan.tasks.map(t=>({...t,files:Array.isArray(t.files)?t.files.map(safePath):[]}))};
}
export function stageFile(files,path,content) {
 safePath(path);
 if(typeof content!=='string'||Buffer.byteLength(content)>100000) throw new Error('Arquivo excede 100 KB.');
 if(!Object.hasOwn(files,path)&&Object.keys(files).length>=250) throw new Error('Limite de 250 arquivos.');
 const next={...files,[path]:content};
 if(Buffer.byteLength(JSON.stringify(next))>4000000) throw new Error('Workspace excede 4 MB.');
 return next;
}
export function fingerprint(files) {return createHash('sha256').update(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');}
export function diffFiles(before,after) {
 return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().filter(p=>before[p]!==after[p]).map(path=>({path,before:before[path]??'',after:after[path]??'',added:!Object.hasOwn(before,path),deleted:!Object.hasOwn(after,path)}));
}
export function parseJSON(text) {
 const raw=text.trim().replace(/^\x60\x60\x60(?:json)?\s*/,'').replace(/\s*\x60\x60\x60$/,'');
 return JSON.parse(raw);
}
