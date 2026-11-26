import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
test('HTTP demo lifecycle, persistence, approval guards and origin checks',async()=>{
 const data=await mkdtemp(join(tmpdir(),'agent-studio-'));const port=19800+Math.floor(Math.random()*1000);
 const base='http://127.0.0.1:'+port;
 let child;
 const start=async()=>{
  child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),STUDIO_DATA_DIR:data,AI_API_KEY:'',AI_MODEL:''},stdio:['ignore','pipe','pipe']});
  let errors='';child.stderr.on('data',b=>errors+=b.toString());
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/config')).ok)return;}catch{}await delay(30);}
  throw new Error('Server failed: '+errors);
 };
 const stop=async()=>{if(child&&child.exitCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await done;}};
 const post=async(path,body={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const wait=async(id,status)=>{
  for(let i=0;i<150;i++){const r=await (await fetch(base+'/api/runs/'+id)).json();if(r.status===status)return r;if(r.status==='error')throw new Error(r.error);await delay(25);}
  throw new Error('Timed out: '+status);
 };
 try{
  await start();
  assert.equal((await fetch(base+'/')).status,200);
  for(const module of ['stage-model.js','stage-view.js','case-gallery.js']){const asset=await fetch(base+'/'+module);assert.equal(asset.status,200);assert.match(asset.headers.get('content-type'),/javascript/);}
  const cases=await (await fetch(base+'/api/cases')).json();assert.equal(cases.length,6);assert.equal(cases[5].architecture,'single');
  assert.equal((await fetch(base+'/api/config',{headers:{Origin:'https://evil.example'}})).status,403);
  assert.equal((await post('/api/runs',{mode:'live',prompt:'build'})).status,400);
  const created=await post('/api/runs',{mode:'demo',prompt:'Health'});assert.equal(created.status,201);const {id}=await created.json();
  await wait(id,'awaiting_plan');
  assert.equal((await post('/api/runs/'+id+'/approve-files')).status,409);
  assert.equal((await post('/api/runs/'+id+'/approve-plan')).status,202);
  const ready=await wait(id,'awaiting_files');assert.ok(ready.review.approved);assert.ok(ready.files['health.test.mjs']);
  assert.equal((await post('/api/runs/'+id+'/approve-files')).status,202);
  const done=await wait(id,'completed');assert.equal(done.test.code,0);assert.match(done.test.output,/health returns ok/);
  const exported=await (await fetch(base+'/api/runs/'+id+'/files')).json();assert.equal(exported.mode,'demo');
  await stop();await start();
  const restored=await (await fetch(base+'/api/runs/'+id)).json();assert.equal(restored.status,'completed');
  const second=await (await post('/api/runs',{mode:'demo',prompt:'Cancel'})).json();await wait(second.id,'awaiting_plan');
  await post('/api/runs/'+second.id+'/cancel');await wait(second.id,'cancelled');
 }finally{await stop();await rm(data,{recursive:true,force:true});}
});
