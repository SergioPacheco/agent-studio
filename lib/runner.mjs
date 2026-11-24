import {mkdir,writeFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {safePath,fingerprint,diffFiles} from './core.mjs';
import {DEMO_FILES} from './engine.mjs';
import {applyChanges,snapshot} from './projects.mjs';
import {command} from './process.mjs';
export async function materialize(root,files){await mkdir(root,{recursive:true,mode:0o755});for(const [p,c] of Object.entries(files)){safePath(p);const dest=join(root,p);await mkdir(dirname(dest),{recursive:true});await writeFile(dest,c,{flag:'wx',mode:0o644});}return root;}
export async function dockerCommand(dir,argv,{signal,image='node:22-alpine',timeout=60000}={}){
 const name='agent-studio-'+randomUUID();
 try{return await command('docker',['run','--rm','--pull=never','--name',name,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=128','--memory=512m','--cpus=1','--user=65534:65534','--tmpfs=/tmp:rw,noexec,nosuid,size=32m','--mount','type=bind,source='+dir+',target=/work,readonly','--workdir=/work',image,...argv],{signal,timeout});}
 finally{await command('docker',['rm','-f',name],{timeout:5000}).catch(()=>{});}
}
export function createRunner({dataDir,getProject,persist}){
 return async(r,signal)=>{
  let files={...r.files};const project=r.projectConfig||(r.projectId?getProject(r.projectId):null);
  if(project){
   const expected=r.appliedFiles||r.baseline;
   if(fingerprint((await snapshot(project.path)).files)!==fingerprint(expected))throw new Error('Projeto mudou fora do estúdio. Refaça o pedido antes de aplicar.');
   const accepted=r.selectedFiles||diffFiles(r.baseline,files).map(d=>d.path);
   const actual=diffFiles(expected,files).map(d=>d.path).filter(p=>accepted.includes(p));
   if(actual.length){const applied=await applyChanges({root:project.path,baseline:expected,files,selected:actual,backupDir:join(dataDir,'backups',r.id+'-'+(r.testRepairs||0))});files=applied.files;r.backups??=[];r.backups.push(applied.backup);}
   else files={...expected};
   r.appliedFiles={...files};r.appliedPaths=diffFiles(r.baseline,files).map(d=>d.path);await persist(r);
  }else if(r.mode!=='demo'){
   const accepted=r.selectedFiles||Object.keys(files);files=Object.fromEntries(Object.entries(files).filter(([p])=>accepted.includes(p)));
  }
  const dir=await materialize(join(dataDir,'artifacts',r.id+'-'+(r.testRepairs||0)),files);r.artifactDirectory=dir;
  if(r.mode==='demo'){
   if(fingerprint(files)!==fingerprint(DEMO_FILES))throw new Error('Fixture demo alterado.');return command(process.execPath,['--test','health.test.mjs'],{cwd:dir,signal});
  }
  const tests=project?.testCommand||['node','--test',...Object.keys(files).filter(p=>!p.includes('/')&&p.endsWith('.test.mjs')).sort()];
  if(!project&&tests.length===2)throw new Error('Nenhum teste *.test.mjs na raiz.');
  if(project?.testMode==='host'){
   if(fingerprint((await snapshot(project.path)).files)!==fingerprint(files))throw new Error('Arquivos mudaram antes dos testes.');
   const secretEnv=Object.fromEntries(Object.keys(process.env).filter(k=>/KEY|TOKEN|SECRET|PASSWORD/i.test(k)).map(k=>[k,'']));
   return command(tests[0],tests.slice(1),{cwd:project.path,signal,timeout:120000,env:secretEnv});
  }
  return dockerCommand(dir,tests,{signal,image:project?.testImage||process.env.TEST_IMAGE||'node:22-alpine'});
 };
}
