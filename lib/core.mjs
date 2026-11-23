import { createHash } from 'node:crypto';
export const AGENTS = [
 {id:'maestro',name:'Maestro',role:'Coordenação',color:'#a99aff',icon:'♛'},
 {id:'chevron',name:'Chevron',role:'Back-end',color:'#ffb28c',icon:'‹›'},
 {id:'pixel',name:'Pixel',role:'Interface',color:'#f8cf7c',icon:'▦'},
 {id:'scout',name:'Scout',role:'Pesquisa do projeto',color:'#90daca',icon:'✦'},
 {id:'revisor',name:'Revisor',role:'Qualidade',color:'#8dbbff',icon:'✓'}
];
export function safePath(value) {
 if(typeof value!=='string'||value.length>160||!value.split('/').every(s=>/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(s))||! /\.(mjs|js|json|html|css|md|txt)$/.test(value)) throw new Error('Caminho inválido: '+value);
 return value;
}
export function validatePlan(plan) {
 if(!plan || !Array.isArray(plan.tasks)||!plan.tasks.length||plan.tasks.length>8) throw new Error('Plano deve ter 1 a 8 tarefas.');
 const ids=new Set();
 for(const t of plan.tasks){
  if(!t || !/^[a-z0-9-]{1,32}$/.test(t.id)||ids.has(t.id)||!['chevron','pixel','scout'].includes(t.agent)||typeof t.title!=='string'||!t.title.trim()||t.title.length>300||!Array.isArray(t.dependsOn)) throw new Error('Tarefa inválida.');
  if(t.dependsOn.some(id=>!ids.has(id))) throw new Error('Dependência deve apontar para tarefa anterior.');
  ids.add(t.id);
 }
 return {summary:String(plan.summary||'Plano de execução').slice(0,1000),tasks:plan.tasks};
}
export function stageFile(files,path,content) {
 safePath(path);
 if(typeof content!=='string'||Buffer.byteLength(content)>100000) throw new Error('Arquivo excede 100 KB.');
 if(!Object.hasOwn(files,path)&&Object.keys(files).length>=30) throw new Error('Limite de 30 arquivos.');
 const next={...files,[path]:content};
 if(Buffer.byteLength(JSON.stringify(next))>500000) throw new Error('Workspace excede 500 KB.');
 return next;
}
export function fingerprint(files) {return createHash('sha256').update(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)))).digest('hex');}
export function diffFiles(before,after) {
 return Object.keys(after).sort().filter(p=>before[p]!==after[p]).map(path=>({path,before:before[path]??'',after:after[path],added:!Object.hasOwn(before,path)}));
}
export function parseJSON(text) {
 const raw=text.trim().replace(/^\x60\x60\x60(?:json)?\s*/,'').replace(/\s*\x60\x60\x60$/,'');
 return JSON.parse(raw);
}
