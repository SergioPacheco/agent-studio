import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {spawn} from 'node:child_process';import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {setTimeout as delay} from 'node:timers/promises';import {DEMO_FILES} from '../lib/engine.mjs';import {command} from '../lib/process.mjs';
test('existing project: independent work, selective apply, tests, memory, separate chats, commit and safe restore',{timeout:30000},async()=>{
 const data=await mkdtemp(join(tmpdir(),'studio-features-')),root=await mkdtemp(join(tmpdir(),'studio-existing-'));let child,peak=0,requests=0;const systems=[];
 const provider=http.createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const b=JSON.parse(raw),sys=b.messages[0].content;systems.push(sys);let message;
  if(sys.includes('Decide whether'))message={role:'assistant',content:'{"assume":true,"reason":"Can help"}'};
  else if(sys.includes('Plan work'))message={role:'assistant',content:JSON.stringify({summary:'Two independent tasks',tasks:[{id:'api',agent:'chevron',title:'Fix health',dependsOn:[],files:['health.mjs','health.test.mjs']},{id:'ui',agent:'pixel',title:'Create view',dependsOn:[],files:['view.html']}]})};
  else if(sys.includes('Independently review'))message={role:'assistant',content:'{"approved":true,"summary":"Checked independently","findings":[]}'};
  else if(sys.includes('This is a conversation'))message={role:'assistant',content:'Reply from '+(sys.includes('Revisor')?'Revisor':'Maestro')};
  else if(b.messages.some(m=>m.role==='tool'))message={role:'assistant',content:'Done'};
  else{
   peak=Math.max(peak,++requests);await delay(30);requests--;
   const files=sys.includes('Back-end')?{'health.mjs':DEMO_FILES['health.mjs'],'health.test.mjs':DEMO_FILES['health.test.mjs']}:{'view.html':'<h1>Health</h1>'};
   message={role:'assistant',tool_calls:Object.entries(files).map(([path,content],i)=>({id:'call-'+i,type:'function',function:{name:'write_file',arguments:JSON.stringify({path,content})}}))};
  }
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message}],usage:{total_tokens:1}}));
 });
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));const port=23000+Math.floor(Math.random()*1000),base='http://127.0.0.1:'+port;
 const api=async(path,method='GET',body)=>{const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json'},...(body!==undefined?{body:JSON.stringify(body)}:{})});const data=await response.json();return {status:response.status,data};};
 const wait=async(id,status)=>{for(let i=0;i<250;i++){const {data:r}=await api('/api/runs/'+id);if(r.status===status)return r;if(r.status==='error')throw new Error(r.error);await delay(20);}throw new Error('Timeout '+status);};
 try{
  await writeFile(join(root,'health.mjs'),'export function health(){return {status:"broken"};}\n');await writeFile(join(root,'unrelated.md'),'existing user work');
  await command('git',['init'],{cwd:root});await command('git',['config','user.name','Fixture'],{cwd:root});await command('git',['config','user.email','fixture@example.invalid'],{cwd:root});await command('git',['add','unrelated.md'],{cwd:root});
  child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),STUDIO_DATA_DIR:data,AI_API_KEY:'fixture',AI_MODEL:'fixture',AI_BASE_URL:'http://127.0.0.1:'+provider.address().port},stdio:'ignore'});
  let ready=false;for(let i=0;i<150;i++){try{if((await api('/api/config')).status===200){ready=true;break;}}catch{}await delay(20);}assert.ok(ready);
  const created=await api('/api/projects','POST',{name:'Existing app',path:root,testMode:'host',testCommand:[process.execPath,'--test','health.test.mjs']});assert.equal(created.status,201);const project=created.data;
  await api('/api/projects/'+project.id+'/memory','POST',{memory:'Preserve the approved business rules.'});
  const started=await api('/api/runs','POST',{mode:'live',projectId:project.id,prompt:'Fix health and create a view',parallel:true});assert.equal(started.status,201);const id=started.data.id;
  await wait(id,'awaiting_plan');await api('/api/runs/'+id+'/approve-plan','POST',{});const staged=await wait(id,'awaiting_files');assert.equal(await readFile(join(root,'health.mjs'),'utf8'),staged.baseline['health.mjs']);assert.ok(peak>=2);
  assert.equal((await api('/api/runs/'+id+'/approve-files','POST',{selectedFiles:['health.mjs','health.test.mjs']})).status,400);
  assert.equal((await api('/api/runs/'+id+'/approve-files','POST',{selectedFiles:['health.mjs','health.test.mjs'],confirmHostTest:true})).status,202);
  let done=await wait(id,'completed');assert.equal(done.test.code,0);assert.equal(await readFile(join(root,'health.mjs'),'utf8'),DEMO_FILES['health.mjs']);await assert.rejects(()=>readFile(join(root,'view.html')));assert.ok(systems.some(s=>s.includes('Preserve the approved business rules.')));assert.equal(Object.hasOwn((await api('/api/runs/'+id+'/files')).data.files,'view.html'),false);
  const commit=await api('/api/runs/'+id+'/commit','POST',{confirm:true,message:'Fix health',push:false});assert.equal(commit.status,200);assert.match(commit.data.sha,/^[a-f0-9]{40}$/);const committed=await command('git',['show','--format=','--name-only','HEAD'],{cwd:root});assert.ok(!committed.stdout.includes('unrelated.md'));
  const memory=await api('/api/runs/'+id+'/memory','POST',{index:0});assert.equal(memory.status,200);const p=(await api('/api/projects/'+project.id)).data;assert.match(p.memory,/Testes passaram/);
  const one=(await api('/api/conversations','POST',{agentId:'revisor',projectId:project.id,title:'Review chat'})).data;const two=(await api('/api/conversations','POST',{agentId:'maestro',projectId:project.id,title:'Lead chat'})).data;
  assert.equal((await api('/api/conversations/'+one.id+'/messages','POST',{text:'Explain your role'})).status,200);assert.equal((await api('/api/conversations/'+two.id)).data.messages.length,0);assert.equal((await api('/api/conversations/'+one.id)).data.messages.length,2);
  const restored=await api('/api/runs/'+id+'/restore','POST',{});assert.equal(restored.status,200);assert.equal(await readFile(join(root,'health.mjs'),'utf8'),staged.baseline['health.mjs']);
 }finally{
  if(child&&child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}await new Promise(resolve=>provider.close(resolve));await rm(data,{recursive:true,force:true});await rm(root,{recursive:true,force:true});
 }
});
