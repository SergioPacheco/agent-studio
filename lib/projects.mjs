import {readFile,writeFile,mkdir,readdir,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {join,resolve,dirname,parse} from 'node:path';
import {randomUUID} from 'node:crypto';
import {safePath,diffFiles,fingerprint} from './core.mjs';
const excluded=new Set(['.git','.studio','node_modules','target','build','dist','coverage','.idea','.vscode','.next','venv','.venv','__pycache__']);
export async function projectPath(input){if(typeof input!=='string'||!input.trim())throw new Error('Informe a pasta do projeto.');const root=await realpath(resolve(input));if(root===parse(root).root||!(await lstat(root)).isDirectory())throw new Error('Selecione uma pasta de projeto, não a raiz do sistema.');return root;}
export function testCommand(value){if(!Array.isArray(value)||!value.length||value.length>30||value.some(x=>typeof x!=='string'||x.length>1000||x.includes('\0'))||!value[0].trim())throw new Error('Comando de testes deve ser uma lista JSON de executável e argumentos.');return value;}
export async function snapshot(root){
 root=await projectPath(root);const files={},skipped=[];let bytes=0;
 async function walk(dir,prefix=''){
  const entries=(await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));
  for(const entry of entries){const rel=prefix+entry.name;
   if(entry.isSymbolicLink()){skipped.push(rel+' (link simbólico)');continue;}
   if(entry.isDirectory()){if(!excluded.has(entry.name)&&(!entry.name.startsWith('.')||entry.name==='.github'))await walk(join(dir,entry.name),rel+'/');continue;}
   if(/^(auth|credentials|secrets)\.json$/i.test(entry.name)){skipped.push(rel+' (credenciais)');continue;}
   try{safePath(rel);}catch{skipped.push(rel);continue;}
   const path=join(root,rel),stat=await lstat(path);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Arquivo mudou durante leitura: '+rel);
   if(stat.size>100000){skipped.push(rel+' (>100 KB)');continue;}
   const text=await readFile(path,'utf8');if(text.includes('\0')){skipped.push(rel+' (binário)');continue;}
   if(Object.keys(files).length>=250||bytes+Buffer.byteLength(text)>4000000)throw new Error('Projeto excede 250 arquivos/4 MB de texto. Selecione uma subpasta menor.');
   files[rel]=text;bytes+=Buffer.byteLength(text);
  }
 }
 await walk(root);return {files,skipped,hash:fingerprint(files)};
}
export async function checkedTarget(root,path,{create=false}={}){
 safePath(path);root=await projectPath(root);const parts=path.split('/');let cursor=root;
 for(let i=0;i<parts.length-1;i++){
  cursor=join(cursor,parts[i]);let stat;try{stat=await lstat(cursor);}catch(e){if(e.code!=='ENOENT')throw e;if(!create)return null;await mkdir(cursor);stat=await lstat(cursor);}
  if(stat.isSymbolicLink()||!stat.isDirectory())throw new Error('Diretório inseguro: '+path);
 }
 const target=join(root,path);try{const stat=await lstat(target);if(stat.isSymbolicLink()||!stat.isFile())throw new Error('Destino inseguro: '+path);}catch(e){if(e.code!=='ENOENT')throw e;}
 return target;
}
async function currentFile(root,path){const target=await checkedTarget(root,path);if(!target)return undefined;try{return await readFile(target,'utf8');}catch(e){if(e.code==='ENOENT')return undefined;throw e;}}
async function put(root,path,content){const target=await checkedTarget(root,path,{create:content!==undefined});if(!target)return;if(content===undefined){try{await unlink(target);}catch(e){if(e.code!=='ENOENT')throw e;}return;}const temp=target+'.studio-'+randomUUID();await writeFile(temp,content,{flag:'wx',mode:0o644});try{await checkedTarget(root,path);await rename(temp,target);}catch(e){await unlink(temp).catch(()=>{});throw e;}}
export async function applyChanges({root,baseline,files,selected,backupDir}){
 const diffs=diffFiles(baseline,files),all=new Set(diffs.map(d=>d.path));
 if(!Array.isArray(selected)||!selected.length||selected.some(p=>!all.has(p))||new Set(selected).size!==selected.length)throw new Error('Seleção de arquivos inválida ou vazia.');
 const original={};for(const p of selected){const value=await currentFile(root,p);if(value!==baseline[p])throw new Error('Conflito: '+p+' mudou fora do estúdio. Nenhuma alteração aplicada.');original[p]=value===undefined?null:value;}
 await mkdir(backupDir,{recursive:true});await writeFile(join(backupDir,'backup.json'),JSON.stringify({root,original,expected:Object.fromEntries(selected.map(p=>[p,files[p]??null]))},null,2),{flag:'wx',mode:0o600});
 const written=[];
 try{for(const p of selected){if(await currentFile(root,p)!==baseline[p])throw new Error('Conflito durante aplicação: '+p);await put(root,p,files[p]);written.push(p);}}
 catch(e){for(const p of written.reverse())await put(root,p,original[p]===null?undefined:original[p]);throw e;}
 const approved={...baseline};for(const p of selected){if(Object.hasOwn(files,p))approved[p]=files[p];else delete approved[p];}
 return {files:approved,selected,backup:join(backupDir,'backup.json')};
}
export async function restoreBackup(path){const backup=JSON.parse(await readFile(path,'utf8'));for(const [p,expected] of Object.entries(backup.expected))if(await currentFile(backup.root,p)!==(expected===null?undefined:expected))throw new Error('Não é possível restaurar: '+p+' mudou depois da aplicação.');for(const [p,original] of Object.entries(backup.original))await put(backup.root,p,original===null?undefined:original);return Object.keys(backup.original);}
