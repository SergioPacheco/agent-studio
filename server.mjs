import http from 'node:http';
import {readFile,writeFile,mkdir,readdir,rename} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {AGENTS,safePath,diffFiles,fingerprint} from './lib/core.mjs';
import {Engine,command,DEMO_FILES} from './lib/engine.mjs';
const ROOT=dirname(fileURLToPath(import.meta.url));
const DATA=resolve(process.env.STUDIO_DATA_DIR||join(ROOT,'.studio'));
const PORT=Number(process.env.PORT||5173);
const HOST='127.0.0.1';
const config={base:(process.env.AI_BASE_URL||'https://api.openai.com/v1').replace(/\/$/,''),key:process.env.AI_API_KEY||'',model:process.env.AI_MODEL||'',models:Object.fromEntries(AGENTS.map(a=>[a.id,process.env['AI_MODEL_'+a.id.toUpperCase()]]))};
await mkdir(join(DATA,'runs'),{recursive:true});
const runs=new Map(),streams=new Set(),busy=new Set(),saves=new Map();
const active=new Set(['planning','executing','reviewing','testing']);
for(const name of await readdir(join(DATA,'runs'))){
 if(!/^[a-f0-9-]+\.json$/.test(name))continue;
 try{const r=JSON.parse(await readFile(join(DATA,'runs',name),'utf8'));if(active.has(r.status)){r.status='interrupted';r.error='Servidor reiniciado durante execução; crie uma nova execução.';}runs.set(r.id,r);}catch(e){console.error('Não foi possível ler execução',name,e.message);}
}
function broadcast(r){for(const res of streams)res.write('data: '+JSON.stringify(r)+'\n\n');}
function persist(r){
 const data=JSON.stringify(r,null,2);
 const promise=(saves.get(r.id)||Promise.resolve()).catch(()=>{}).then(async()=>{
  const path=join(DATA,'runs',r.id+'.json'),temp=path+'.tmp';
  await writeFile(temp,data);await rename(temp,path);broadcast(r);
 });
 saves.set(r.id,promise);return promise;
}
async function runner(r,signal){
 const dir=join(DATA,'artifacts',r.id);
 // Each run writes into a fresh private directory; retries require a fresh run.
 await mkdir(dirname(dir),{recursive:true});
 await mkdir(dir,{recursive:false,mode:0o755});
 for(const [p,c] of Object.entries(r.files)){safePath(p);const target=join(dir,p);await mkdir(dirname(target),{recursive:true});await writeFile(target,c,{mode:0o644,flag:'wx'});}
 r.artifactDirectory=dir;
 const tests=Object.keys(r.files).filter(p=>!p.includes('/')&&p.endsWith('.test.mjs')).sort();
 if(!tests.length)throw new Error('Nenhum *.test.mjs na raiz; testes não executados.');
 if(r.mode==='demo'){
  if(fingerprint(r.files)!==fingerprint(DEMO_FILES))throw new Error('Cenário demonstrativo foi alterado.');
  return command(process.execPath,['--test',...tests],{cwd:dir,signal});
 }
 const name='agent-studio-'+r.id;
 try{
  return await command('docker',['run','--rm','--pull=never','--name',name,'--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=64','--memory=256m','--cpus=1','--user=65534:65534','--tmpfs=/tmp:rw,noexec,nosuid,size=16m','--mount','type=bind,source='+dir+',target=/work,readonly','--workdir=/work',process.env.TEST_IMAGE||'node:22-alpine','node','--test',...tests],{signal,timeout:30000});
 }finally{await command('docker',['rm','-f',name],{timeout:5000}).catch(()=>{});}
}
const engine=new Engine({persist,config,runner});
function launch(r,fn){if(busy.has(r.id))throw new Error('Execução ocupada.');busy.add(r.id);void fn().catch(console.error).finally(()=>busy.delete(r.id));}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
async function body(req){let s='';for await(const chunk of req){s+=chunk;if(Buffer.byteLength(s)>20000)throw new Error('Pedido excede 20 KB.');}return JSON.parse(s||'{}');}
const assets={'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/style.css':['style.css','text/css']};
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
 try{
  const allowed=new Set([HOST+':'+PORT,'localhost:'+PORT]);
  if(!allowed.has(req.headers.host))return json(res,403,{error:'Host não permitido.'});
  if(req.headers.origin&&!new Set(['http://'+HOST+':'+PORT,'http://localhost:'+PORT]).has(req.headers.origin))return json(res,403,{error:'Origem não permitida.'});
  const url=new URL(req.url,'http://'+HOST);
  if(req.method==='GET'&&assets[url.pathname]){
   const [file,type]=assets[url.pathname];res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(await readFile(join(ROOT,'public',file)));return;
  }
  if(url.pathname==='/api/config'&&req.method==='GET')return json(res,200,{agents:AGENTS,liveAvailable:!!(config.key&&config.model),model:config.model||null});
  if(url.pathname==='/api/runs'&&req.method==='GET')return json(res,200,[...runs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)));
  if(url.pathname==='/api/events'&&req.method==='GET'){
   res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write(': connected\n\n');streams.add(res);
   const timer=setInterval(()=>res.write(': ping\n\n'),15000);
   res.on('close',()=>{clearInterval(timer);streams.delete(res);});return;
  }
  if(url.pathname==='/api/runs'&&req.method==='POST'){
   if([...runs.values()].some(r=>active.has(r.status)))return json(res,409,{error:'Aguarde ou cancele a execução ativa.'});
   const b=await body(req);
   if(!['demo','live'].includes(b.mode)||typeof b.prompt!=='string'||!b.prompt.trim()||b.prompt.length>4000)return json(res,400,{error:'Informe modo e objetivo com até 4.000 caracteres.'});
   if(b.mode==='live'&&!(config.key&&config.model))return json(res,400,{error:'Configure AI_API_KEY e AI_MODEL no servidor.'});
   const now=new Date().toISOString();
   const r={id:randomUUID(),prompt:b.prompt.trim(),mode:b.mode,status:'planning',createdAt:now,updatedAt:now,events:[],files:{},baseline:{},agents:Object.fromEntries(AGENTS.map(a=>[a.id,'idle'])),usage:{calls:0,tokens:0}};
   runs.set(r.id,r);await persist(r);launch(r,()=>engine.start(r));return json(res,201,r);
  }
  const match=url.pathname.match(/^\/api\/runs\/([a-f0-9-]+)(?:\/(approve-plan|approve-files|cancel|diff|files))?$/);
  if(match){
   const r=runs.get(match[1]);if(!r)return json(res,404,{error:'Execução não encontrada.'});
   const action=match[2];
   if(req.method==='GET'&&!action)return json(res,200,r);
   if(req.method==='GET'&&action==='diff')return json(res,200,diffFiles(r.baseline,r.files));
   if(req.method==='GET'&&action==='files'){res.setHeader('Content-Disposition','attachment; filename="agent-studio-'+r.id+'.json"');return json(res,200,{objective:r.prompt,mode:r.mode,files:r.files,review:r.review,test:r.test});}
   if(req.method==='POST'&&action){
    await body(req);
    if(action==='cancel'){
     engine.cancel(r.id);
     if(!busy.has(r.id)){r.status='cancelled';await persist(r);}
     return json(res,200,{ok:true});
    }
    if(busy.has(r.id))return json(res,409,{error:'Execução ocupada.'});
    if(action==='approve-plan'&&r.status==='awaiting_plan'){r.status='executing';await persist(r);launch(r,()=>engine.execute(r));return json(res,202,{ok:true});}
    if(action==='approve-files'&&r.status==='awaiting_files'){r.status='testing';await persist(r);launch(r,()=>engine.test(r));return json(res,202,{ok:true});}
    return json(res,409,{error:'Ação incompatível com o estado atual.'});
   }
  }
  json(res,404,{error:'Rota não encontrada.'});
 }catch(e){json(res,400,{error:e.message});}
});
server.listen(PORT,HOST,()=>console.log('Agent Studio: http://'+HOST+':'+PORT));
process.on('SIGTERM',()=>{for(const id of busy)engine.cancel(id);for(const res of streams)res.end();server.close();});
