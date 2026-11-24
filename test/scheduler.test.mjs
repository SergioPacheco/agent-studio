import test from 'node:test';import assert from 'node:assert/strict';import {scheduleTasks,Engine} from '../lib/engine.mjs';import {setTimeout as delay} from 'node:timers/promises';
test('independent tasks overlap, dependencies and file reservations serialize correctly',async()=>{
 let active=0,peak=0;const finished=new Set(),tasks=[{id:'a',agent:'one',dependsOn:[],files:['a.mjs']},{id:'b',agent:'two',dependsOn:[],files:['b.mjs']},{id:'c',agent:'three',dependsOn:['a','b'],files:['a.mjs']}];
 await scheduleTasks(tasks,async task=>{for(const d of task.dependsOn)assert.ok(finished.has(d));peak=Math.max(peak,++active);await delay(15);active--;finished.add(task.id);});assert.equal(peak,2);assert.ok(tasks.every(t=>t.status==='done'));
 let overlap=0;await scheduleTasks([{id:'a',agent:'one',dependsOn:[],files:['same.mjs']},{id:'b',agent:'two',dependsOn:[],files:['same.mjs']}],async()=>{assert.equal(overlap++,0);await delay(2);overlap--;});
});
test('parallel writes cannot silently overwrite an earlier task result',async()=>{
 const r={id:'conflict',prompt:'test',mode:'live',files:{},events:[],agents:{},usage:{calls:0,tokens:0},plan:{tasks:[{id:'a',agent:'chevron',title:'a',dependsOn:[]},{id:'b',agent:'pixel',title:'b',dependsOn:[]}]}};
 const engine=new Engine({persist:async()=>{},config:{}}),calls={};
 engine.model=async(_r,role)=>{calls[role]=(calls[role]||0)+1;if(calls[role]===1){await delay(5);return {role:'assistant',tool_calls:[{id:role,function:{name:'write_file',arguments:JSON.stringify({path:'same.mjs',content:role})}}]};}return {role:'assistant',content:'done'};};
 await engine.execute(r);assert.equal(r.status,'error');assert.match(r.error,/Conflito entre tarefas/);assert.ok(['chevron','pixel'].includes(r.files['same.mjs']));
});
test('permissions reject tool requests that were not assigned to the agent',async()=>{
 const r={id:'permissions',prompt:'test',mode:'live',files:{'a.mjs':'original'},events:[],agents:{},usage:{calls:0,tokens:0}};const engine=new Engine({persist:async()=>{},config:{}});let count=0;
 engine.controllers.set(r.id,new AbortController());engine.model=async(_r,_role,messages)=>{if(count++===0)return {role:'assistant',tool_calls:[{id:'one',function:{name:'write_file',arguments:'{"path":"a.mjs","content":"oops"}'}}]};assert.match(messages.at(-1).content,/não permitida/);return {role:'assistant',content:'no access'};};await engine.work(r,'scout','Inspect');assert.equal(r.files['a.mjs'],'original');
});
