import {CASES} from './lib/architectures.mjs';
import http from 'node:http';
import {readFile,mkdir,access} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname,delimiter} from 'node:path';
import {randomUUID,timingSafeEqual} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {AGENTS,diffFiles,fingerprint} from './lib/core.mjs';
import {Engine} from './lib/engine.mjs';
import {Store} from './lib/store.mjs';
import {defaults,validateAgent,validateProvider} from './lib/catalog.mjs';
import {ProviderRouter} from './lib/providers.mjs';
import {projectPath,snapshot,testCommand,restoreBackup} from './lib/projects.mjs';
import {createRunner,materialize,dockerCommand} from './lib/runner.mjs';
import {Conversations} from './lib/conversations.mjs';
import {transcribeAudio} from './lib/voice.mjs';
import {command} from './lib/process.mjs';
const ROOT=dirname(fileURLToPath(import.meta.url)),DATA=resolve(process.env.STUDIO_DATA_DIR||join(ROOT,'.studio'));
const PORT=Number(process.env.PORT||5173),HOST='127.0.0.1';
const PUBLIC=process.env.STUDIO_PUBLIC_ORIGIN?new URL(process.env.STUDIO_PUBLIC_ORIGIN):null;
if(PUBLIC&&!process.env.STUDIO_AUTH_TOKEN)throw new Error('STUDIO_PUBLIC_ORIGIN requer STUDIO_AUTH_TOKEN.');
const store=new Store(DATA),catalog=await store.read('catalog',defaults());
const router=new ProviderRouter({catalog}),runs=new Map(),streams=new Set(),jobs=new Map(),actionWaiters=new Map(),projectLocks=new Set();
const sessions=new Map(),loginAttempts=new Map();
const active=new Set(['planning','executing','awaiting_command','reviewing','testing']);
for(const name of await store.list('runs')){const r=await store.read(name,null);if(!r)continue;if(active.has(r.status)){r.status='interrupted';r.error='Servidor reiniciado durante execução. Refaça o pedido; efeitos já aplicados devem ser revisados.';for(const a of r.pendingActions||[])if(a.status==='pending')a.status='interrupted';await store.write(name,r);}runs.set(r.id,r);}
const conversations=new Conversations({store,router,catalog});await conversations.init();
async function persist(r){await store.write('runs/'+r.id,r);for(const res of streams)res.write('data: '+JSON.stringify(r)+'\n\n');}
async function executableAvailable(type){const name=process.env['STUDIO_'+type.split('-')[0].toUpperCase()+'_CLI']||type.split('-')[0];const paths=name.includes('/')?[name]:(process.env.PATH||'').split(delimiter).flatMap(p=>process.platform==='win32'?[join(p,name+'.cmd'),join(p,name+'.exe')]:[join(p,name)]);for(const path of paths)try{await access(path,constants.X_OK);return true;}catch{}return false;}
async function providerStatuses(){return Promise.all(catalog.providers.map(async p=>({id:p.id,available:p.enabled&&(p.type.endsWith('-cli')?await executableAvailable(p.type):!!process.env[p.keyEnv]),authenticationVerified:false})));}
async function liveAvailable(){const statuses=await providerStatuses();return catalog.agents.every(a=>statuses.some(p=>p.id===a.provider&&p.available));}
function getProject(id){const p=catalog.projects.find(p=>p.id===id);if(!p)throw new Error('Projeto não encontrado.');return p;}
async function saveCatalog(){await store.write('catalog',catalog);}
function launch(r,fn){if(jobs.has(r.id))throw new Error('Execução ocupada.');const p=fn().catch(console.error).finally(()=>jobs.delete(r.id));jobs.set(r.id,p);}
async function requestApproval(r,agent,descriptor,signal){
 const action={id:randomUUID(),agent,...structuredClone(descriptor),status:'pending',createdAt:new Date().toISOString()};r.pendingActions??=[];r.pendingActions.push(action);const previous=r.status;r.status='awaiting_command';
 const pending=new Promise((resolve,reject)=>{
  const abort=()=>{actionWaiters.delete(action.id);action.status='cancelled';reject(new Error('Cancelado'));};
  const timer=setTimeout(()=>{actionWaiters.delete(action.id);action.status='expired';signal?.removeEventListener('abort',cancel);reject(new Error('Aprovação expirou após 15 minutos.'));},900000);
  const cancel=()=>{clearTimeout(timer);abort();};signal?.addEventListener('abort',cancel,{once:true});
  actionWaiters.set(action.id,decision=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);resolve(decision);});
 });
 pending.catch(()=>{});
 await engine.event(r,agent,'Aguardando aprovação: '+action.label,'waiting',{kind:'approval',action:action.id});
 try{const allow=await pending;if(!allow)throw new Error('Comando recusado pelo usuário.');return action;}
 finally{if(r.status==='awaiting_command'&&!r.pendingActions.some(a=>a.status==='pending'))r.status=previous;await persist(r);}
}
const baseRunner=createRunner({dataDir:DATA,getProject,persist});
const runner=async(r,signal)=>{if(r.projectId&&projectLocks.has(r.projectId))throw new Error('Projeto ocupado.');if(r.projectId)projectLocks.add(r.projectId);try{return await baseRunner(r,signal);}finally{if(r.projectId)projectLocks.delete(r.projectId);}};
const engine=new Engine({persist,router,runner,requestCommand:async(r,agent,args,files,signal)=>{
 testCommand([args.executable,...(args.args||[])]);if(typeof args.reason!=='string'||args.reason.length>2000)throw new Error('Justificativa inválida.');
 const argv=[args.executable,...args.args],image=r.projectId?getProject(r.projectId).testImage:'node:22-alpine';
 const approved=await requestApproval(r,agent,{type:'command',label:'Executar comando em container isolado',argv,image,reason:args.reason,cwd:'snapshot isolado dos arquivos preparados'},signal);
 const dir=await materialize(join(DATA,'commands',approved.id),files);const result=await dockerCommand(dir,argv,{signal,image});approved.result={code:result.code,output:result.output.slice(0,10000)};await engine.event(r,agent,'Comando terminou com código '+result.code,'working',{kind:'command-result',action:approved.id});return result;
},complete:async r=>{
 const result=r.test.code===0?'Testes passaram.':'Testes falharam.';
 if(r.conversationId)await conversations.append(r.conversationId,'assistant',result+' '+(r.review?.summary||''),{runId:r.id,agent:engine.lead(r)});
 if(r.projectId){r.memorySuggestions??=[];r.memorySuggestions.push({agent:engine.lead(r),note:'Execução '+r.id+': '+r.prompt+' · '+result+' · Arquivos: '+(r.appliedPaths||Object.keys(r.files)).join(', '),approved:false});await persist(r);}
}});
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
async function body(req,max=100000){let s='';for await(const c of req){s+=c;if(Buffer.byteLength(s)>max)throw new Error('Pedido excede o limite.');}return JSON.parse(s||'{}');}
const assets={'/stage-model.js':['stage-model.js','text/javascript'],'/stage-view.js':['stage-view.js','text/javascript'],'/':['index.html','text/html'],'/app.js':['app.js','text/javascript'],'/visuals.js':['visuals.js','text/javascript'],'/mascot3d.js':['mascot3d.js','text/javascript'],'/studio.js':['studio.js','text/javascript'],'/style.css':['style.css','text/css']};
function equalToken(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
function authenticated(req){if(!process.env.STUDIO_AUTH_TOKEN)return true;if(equalToken(req.headers.authorization,'Bearer '+process.env.STUDIO_AUTH_TOKEN))return true;const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('studio_session='))?.slice(15);return !!token&&(sessions.get(token)||0)>Date.now();}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'");
 try{
  const hosts=new Set([HOST+':'+PORT,'localhost:'+PORT,...(PUBLIC?[PUBLIC.host]:[])]),origins=new Set(['http://'+HOST+':'+PORT,'http://localhost:'+PORT,...(PUBLIC?[PUBLIC.origin]:[])]);
  if(!hosts.has(req.headers.host))return json(res,403,{error:'Host não permitido.'});if(req.headers.origin&&!origins.has(req.headers.origin))return json(res,403,{error:'Origem não permitida.'});
  const url=new URL(req.url,'http://'+HOST);
  if(req.method==='GET'&&assets[url.pathname]){const [file,type]=assets[url.pathname];res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});res.end(await readFile(join(ROOT,'public',file)));return;}
  if(url.pathname==='/api/session'&&req.method==='POST'){
   const input=await body(req),key=req.socket.remoteAddress,attempt=loginAttempts.get(key)||{count:0,at:Date.now()};if(Date.now()-attempt.at>60000){attempt.count=0;attempt.at=Date.now();}attempt.count++;loginAttempts.set(key,attempt);
   if(attempt.count>10)return json(res,429,{error:'Aguarde um minuto antes de tentar novamente.'});
   if(!equalToken(input.token,process.env.STUDIO_AUTH_TOKEN)||!process.env.STUDIO_AUTH_TOKEN)return json(res,401,{error:'Token inválido.'});const token=randomUUID();sessions.set(token,Date.now()+86400000);res.setHeader('Set-Cookie','studio_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400'+(PUBLIC?.protocol==='https:'?'; Secure':''));return json(res,200,{ok:true});
  }
  if(!authenticated(req))return json(res,401,{error:'Informe o token de acesso do servidor.',authenticationRequired:true});
  if(url.pathname==='/api/cases'&&req.method==='GET')return json(res,200,CASES);
  if(url.pathname==='/api/config'&&req.method==='GET')return json(res,200,{agents:catalog.agents,providers:catalog.providers,projects:catalog.projects,settings:catalog.settings,liveAvailable:await liveAvailable(),model:process.env.AI_MODEL||null,voice:{localTranscription:!!process.env.STUDIO_STT_COMMAND}});
  if(url.pathname==='/api/providers/status'&&req.method==='GET')return json(res,200,await providerStatuses());
  if(url.pathname==='/api/providers'&&req.method==='POST'){
   if([...runs.values()].some(r=>active.has(r.status)))throw new Error('Aguarde a execução ativa para alterar provedores.');const p=validateProvider(await body(req));const i=catalog.providers.findIndex(x=>x.id===p.id);if(i<0)catalog.providers.push(p);else catalog.providers[i]=p;await saveCatalog();return json(res,200,p);
  }
  if(url.pathname==='/api/agents'&&req.method==='POST'){
   const a=validateAgent(await body(req),catalog.providers),i=catalog.agents.findIndex(x=>x.id===a.id);if(i<0&&catalog.agents.length>=12)throw new Error('Máximo de 12 agentes.');const next=catalog.agents.filter(x=>x.id!==a.id).concat(a);if(next.filter(x=>x.kind==='coordinator').length!==1||next.filter(x=>x.kind==='reviewer').length!==1)throw new Error('Mantenha exatamente um coordenador e um revisor.');if(i<0)catalog.agents.push(a);else catalog.agents[i]=a;await saveCatalog();return json(res,200,a);
  }
  if(url.pathname==='/api/projects'&&req.method==='POST'){
   const b=await body(req),root=await projectPath(b.path);if(catalog.projects.some(p=>p.path===root))throw new Error('Esta pasta já está cadastrada.');const project={id:randomUUID(),name:String(b.name||root.split(/[\\/]/).at(-1)).slice(0,80),path:root,memory:'',testMode:b.testMode==='host'?'host':'docker',testCommand:testCommand(b.testCommand||['node','--test']),testImage:String(b.testImage||'node:22-alpine')};if(!/^[a-zA-Z0-9_./:@-]{1,180}$/.test(project.testImage))throw new Error('Imagem inválida.');await snapshot(root);catalog.projects.push(project);await saveCatalog();return json(res,201,project);
  }
  const pm=url.pathname.match(/^\/api\/projects\/([a-f0-9-]+)(?:\/(memory|snapshot|settings))?$/);
  if(pm){const p=getProject(pm[1]);if(req.method==='GET'&&pm[2]==='snapshot')return json(res,200,await snapshot(p.path));if(req.method==='GET')return json(res,200,p);if(req.method==='POST'){
   const b=await body(req);if(pm[2]==='memory'){if(typeof b.memory!=='string'||b.memory.length>12000)throw new Error('Memória deve ter até 12.000 caracteres.');p.memory=b.memory;}
   else if(pm[2]==='settings'){p.testCommand=testCommand(b.testCommand);p.testMode=b.testMode==='host'?'host':'docker';if(typeof b.testImage!=='string'||!/^[a-zA-Z0-9_./:@-]{1,180}$/.test(b.testImage))throw new Error('Imagem inválida.');p.testImage=b.testImage;}
   else throw new Error('Operação desconhecida.');await saveCatalog();return json(res,200,p);
  }}
  if(url.pathname==='/api/voice/transcribe'&&req.method==='POST'){
   if(!/^audio\/(webm|ogg)/.test(req.headers['content-type']||''))throw new Error('Envie áudio WebM/Ogg.');const chunks=[];let bytes=0;for await(const c of req){bytes+=c.length;if(bytes>15000000)throw new Error('Áudio excede 15 MB.');chunks.push(c);}return json(res,200,{text:await transcribeAudio(Buffer.concat(chunks))});
  }
  if(url.pathname==='/api/conversations'){
   if(req.method==='GET')return json(res,200,conversations.list());if(req.method==='POST')return json(res,201,await conversations.create(await body(req)));
  }
  const cm=url.pathname.match(/^\/api\/conversations\/([a-f0-9-]+)(?:\/(messages))?$/);
  if(cm){if(req.method==='GET'){const c=conversations.items.get(cm[1]);return json(res,c?200:404,c||{error:'Conversa ausente.'});}if(req.method==='POST'&&cm[2]){const b=await body(req);return json(res,200,await conversations.respond(cm[1],b.text));}}
  if(url.pathname==='/api/runs'&&req.method==='GET')return json(res,200,[...runs.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,40));
  if(url.pathname==='/api/events'&&req.method==='GET'){res.writeHead(200,{'Content-Type':'text/event-stream',Connection:'keep-alive'});res.write(': connected\n\n');streams.add(res);const timer=setInterval(()=>res.write(': ping\n\n'),15000);res.on('close',()=>{clearInterval(timer);streams.delete(res);});return;}
  if(url.pathname==='/api/runs'&&req.method==='POST'){
   if([...runs.values()].some(r=>active.has(r.status)))return json(res,409,{error:'Aguarde ou cancele a execução ativa.'});const b=await body(req);
   if(!['demo','live'].includes(b.mode)||typeof b.prompt!=='string'||!b.prompt.trim()||b.prompt.length>4000)return json(res,400,{error:'Informe modo e objetivo com até 4.000 caracteres.'});
   if(b.mode==='live'&&!await liveAvailable())return json(res,400,{error:'Configure e instale os provedores de todos os agentes. Veja Configurações.'});if(b.mode==='demo'&&b.projectId)throw new Error('O cenário demo cria um projeto isolado. Use IA para alterar projetos existentes.');
   const project=b.projectId?getProject(b.projectId):null,snap=project?await snapshot(project.path):{files:{},skipped:[]};
   let conversation;if(b.conversationId){conversation=conversations.items.get(b.conversationId);if(!conversation||conversation.projectId!==(project?.id||null)||conversation.agentId!==catalog.agents.find(a=>a.kind==='coordinator').id)throw new Error('Conversa incompatível com projeto/coordenador.');}else conversation=await conversations.create({projectId:project?.id||null,agentId:catalog.agents.find(a=>a.kind==='coordinator').id,title:b.prompt});
   const context=conversation.messages.slice(-10).map(({role,content})=>({role,content}));await conversations.append(conversation.id,'user',b.prompt);
   const now=new Date().toISOString(),team=b.mode==='demo'?defaults({}).agents:structuredClone(catalog.agents);
   const r={id:randomUUID(),prompt:b.prompt.trim(),mode:b.mode,projectId:project?.id||null,projectConfig:project?structuredClone(project):null,projectName:project?.name||'Novo projeto',memory:project?.memory||'',team,providers:structuredClone(catalog.providers),parallel:b.parallel!==false,concurrency:Math.max(1,Math.min(4,Number(b.concurrency)||3)),conversationId:conversation.id,conversationContext:context,status:'planning',createdAt:now,updatedAt:now,events:[],files:{...snap.files},baseline:{...snap.files},skippedFiles:snap.skipped,agents:Object.fromEntries(team.map(a=>[a.id,'idle'])),usage:{calls:0,tokens:0}};
   runs.set(r.id,r);await persist(r);launch(r,()=>engine.start(r));return json(res,201,r);
  }
  const match=url.pathname.match(/^\/api\/runs\/([a-f0-9-]+)(?:\/(approve-plan|approve-files|cancel|diff|files|repair|restore|memory|commit|actions)(?:\/([a-f0-9-]+))?)?$/);
  if(match){
   const r=runs.get(match[1]);if(!r)return json(res,404,{error:'Execução não encontrada.'});const action=match[2];
   if(req.method==='GET'&&!action)return json(res,200,r);if(req.method==='GET'&&action==='diff')return json(res,200,diffFiles(r.baseline,r.files));
   if(req.method==='GET'&&action==='files'){res.setHeader('Content-Disposition','attachment; filename="agent-studio-'+r.id+'.json"');return json(res,200,{objective:r.prompt,mode:r.mode,files:r.appliedFiles||r.files,review:r.review,test:r.test,sources:r.sources,usage:r.usage});}
   if(req.method==='POST'&&action){
    const b=await body(req);
    if(action==='actions'){
     const a=r.pendingActions?.find(a=>a.id===match[3]);const resolveAction=actionWaiters.get(match[3]);if(!a||a.status!=='pending'||!resolveAction)throw new Error('Aprovação expirada ou já respondida.');if(typeof b.approved!=='boolean')throw new Error('Informe aprovação explícita.');a.status=b.approved?'approved':'declined';a.decidedAt=new Date().toISOString();actionWaiters.delete(a.id);await persist(r);resolveAction(b.approved);return json(res,200,{ok:true});
    }
    if(action==='cancel'){engine.cancel(r.id);await jobs.get(r.id);if(!['completed','test_failed'].includes(r.status)){r.status='cancelled';await persist(r);}return json(res,200,{ok:true});}
    if(jobs.has(r.id)&&!active.has(r.status))await jobs.get(r.id);if(jobs.has(r.id))return json(res,409,{error:'Execução ocupada.'});
    if(action==='approve-plan'&&r.status==='awaiting_plan'){r.status='executing';await persist(r);launch(r,()=>engine.execute(r));return json(res,202,{ok:true});}
    if(action==='approve-files'&&r.status==='awaiting_files'){
     const changed=diffFiles(r.baseline,r.files).map(d=>d.path);const selected=b.selectedFiles??changed;if(!Array.isArray(selected)||selected.some(p=>!changed.includes(p))||new Set(selected).size!==selected.length)throw new Error('Seleção de arquivos inválida.');
     if(!r.projectId&&!selected.length)throw new Error('Selecione ao menos um arquivo.');if(r.projectConfig?.testMode==='host'&&b.confirmHostTest!==true)throw new Error('Confirme explicitamente a execução dos testes na pasta original.');r.selectedFiles=selected;r.status='testing';await persist(r);launch(r,()=>engine.test(r));return json(res,202,{ok:true});
    }
    if(action==='repair'&&r.status==='test_failed'){launch(r,()=>engine.repair(r));return json(res,202,{ok:true});}
    if(action==='restore'&&r.projectId&&r.backups?.length){const project=getProject(r.projectId);if(projectLocks.has(project.id))throw new Error('Projeto ocupado.');projectLocks.add(project.id);try{const restored=await restoreBackup(r.backups.at(-1));r.restored=true;await persist(r);return json(res,200,{restored});}finally{projectLocks.delete(project.id);}}
    if(action==='memory'&&r.projectId){const project=getProject(r.projectId),suggestion=r.memorySuggestions?.[b.index];if(!suggestion||suggestion.approved)throw new Error('Sugestão ausente ou já aplicada.');if((project.memory+'\n'+suggestion.note).length>12000)throw new Error('Memória excede 12.000 caracteres; edite-a nas configurações.');project.memory+=(project.memory?'\n':'')+suggestion.note;suggestion.approved=true;await saveCatalog();await persist(r);return json(res,200,{ok:true});}
    if(action==='commit'&&r.status==='completed'&&r.projectId){
     if(typeof b.message!=='string'||!b.message.trim()||b.message.length>200||typeof b.push!=='boolean'||b.confirm!==true)throw new Error('Revise a mensagem e confirme commit/push explicitamente.');
     const project=getProject(r.projectId);if(projectLocks.has(project.id))throw new Error('Projeto ocupado.');projectLocks.add(project.id);
     try{if(!r.appliedPaths?.length)throw new Error('Nenhuma alteração aplicada para commit.');if(fingerprint((await snapshot(project.path)).files)!==fingerprint(r.appliedFiles))throw new Error('Projeto mudou após os testes.');
      const add=await command('git',['add','--',...r.appliedPaths],{cwd:project.path});if(add.code!==0)throw new Error('git add falhou.');const commit=await command('git',['commit','--only','-m',b.message,'--',...r.appliedPaths],{cwd:project.path});if(commit.code!==0)throw new Error('git commit falhou. Confira hooks e configuração no terminal.');
      const revision=await command('git',['rev-parse','HEAD'],{cwd:project.path});r.commit={sha:revision.stdout.trim(),pushed:false};if(b.push){const push=await command('git',['push','origin','HEAD'],{cwd:project.path});if(push.code!==0){await persist(r);throw new Error('Commit criado; push falhou. Confira autenticação no terminal.');}r.commit.pushed=true;}await persist(r);return json(res,200,r.commit);
     }finally{projectLocks.delete(project.id);}
    }
    return json(res,409,{error:'Ação incompatível com o estado atual.'});
   }
  }
  json(res,404,{error:'Rota não encontrada.'});
 }catch(e){json(res,400,{error:e.message});}
});
server.listen(PORT,HOST,()=>console.log('Agent Studio: http://'+HOST+':'+PORT));
process.on('SIGTERM',()=>{conversations.cancelAll();for(const id of jobs.keys())engine.cancel(id);for(const res of streams)res.end();server.close();});
