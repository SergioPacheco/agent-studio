import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {DEMO_FILES} from '../lib/engine.mjs';
test('live protocol: model tools, separate review, approvals and Docker execution',{skip:process.env.RUN_DOCKER_TESTS!=='1',timeout:60000},async()=>{
 const data=await mkdtemp(join(tmpdir(),'agent-studio-live-'));
 let modelCalls=0;
 const provider=http.createServer(async(req,res)=>{
  let raw='';for await(const c of req)raw+=c;const b=JSON.parse(raw);modelCalls++;
  const sys=b.messages[0].content;let message;
  if(sys.includes('Plan work'))message={role:'assistant',content:JSON.stringify({outputKind:'code',architecture:{type:'single',rationale:'Small isolated health module',judge:'Independent review and executable tests'},summary:'Build fixture',tasks:[{id:'health',agent:'chevron',title:'Implement health and tests',dependsOn:[],contract:{delivery:'Health module and existing fixture tests',format:'ES modules',trigger:'Plan approval',validation:'Independent review and node tests'}}]})};
  else if(sys.includes('Independently review'))message={role:'assistant',content:JSON.stringify({approved:true,summary:'Reviewed fixture',findings:[]})};
  else if(b.messages.some(m=>m.role==='tool'&&m.tool_call_id.startsWith('write-')))message={role:'assistant',content:'Files prepared.'};
  else if(!b.messages.some(m=>m.role==='tool'))message={role:'assistant',tool_calls:[{id:'command',type:'function',function:{name:'request_command',arguments:JSON.stringify({executable:'node',args:['-e',"console.log('approved command')"],reason:'Check the test runtime'})}}]};
  else message={role:'assistant',tool_calls:Object.entries(DEMO_FILES).map(([path,content],i)=>({id:'write-'+i,type:'function',function:{name:'write_file',arguments:JSON.stringify({path,content})}}))};
  res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({choices:[{message}],usage:{total_tokens:10}}));
 });
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
 const port=21000+Math.floor(Math.random()*1000),base='http://127.0.0.1:'+port;
 const child=spawn(process.execPath,['server.mjs'],{env:{...process.env,PORT:String(port),STUDIO_DATA_DIR:data,AI_API_KEY:'fixture-not-secret',AI_MODEL:'test-model',AI_BASE_URL:'http://127.0.0.1:'+provider.address().port},stdio:'ignore'});
 const post=async(path,body={})=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const wait=async(id,status)=>{for(let i=0;i<400;i++){const r=await (await fetch(base+'/api/runs/'+id)).json();if(r.status===status)return r;if(['error','test_failed','review_failed'].includes(r.status))throw new Error(JSON.stringify(r.test||r.error||r.review));await delay(50);}throw new Error('Timeout '+status);};
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(base+'/api/config')).ok){ready=true;break;}}catch{}await delay(30);}assert.ok(ready);
  const {id}=await (await post('/api/runs',{mode:'live',prompt:'Implement health module and test'})).json();
  const planned=await wait(id,'awaiting_plan');assert.equal(planned.architecture.type,'single');assert.equal(planned.outputKind,'code');assert.equal(modelCalls,1);await post('/api/runs/'+id+'/approve-plan');
  const pending=await wait(id,'awaiting_command');assert.equal(pending.pendingActions[0].result,undefined);assert.equal(pending.pendingActions[0].status,'pending');
  await post('/api/runs/'+id+'/actions/'+pending.pendingActions[0].id,{approved:true});
  const staged=await wait(id,'awaiting_files');assert.equal(staged.review.approved,true);assert.equal(staged.files['health.mjs'],DEMO_FILES['health.mjs']);
  await post('/api/runs/'+id+'/approve-files');
  const done=await wait(id,'completed');assert.equal(done.test.code,0);assert.match(done.test.command,/--network=none/);assert.match(done.test.output,/health returns ok/);assert.equal(modelCalls,5);assert.equal(done.usage.calls,modelCalls);assert.match(done.pendingActions[0].result.output,/approved command/);
 }finally{
  if(child.exitCode===null){const exited=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await exited;}
  await new Promise(resolve=>provider.close(resolve));await rm(data,{recursive:true,force:true});
 }
});
