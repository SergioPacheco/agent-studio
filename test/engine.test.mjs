import test from 'node:test';
import assert from 'node:assert/strict';
import {Engine} from '../lib/engine.mjs';
function run(mode='live'){return {id:'test',prompt:'Build health',mode,status:'planning',files:{},events:[],agents:{},usage:{calls:0,tokens:0}};}
function engine(runner=async()=>({code:0,output:'ok'})){return new Engine({persist:async()=>{},config:{models:{}},runner});}
test('demo waits for both approvals and executes independent runner',async()=>{
 let calls=0;const e=engine(async()=>{calls++;return {code:0,output:'pass'};}),r=run('demo');
 await e.start(r);assert.equal(r.status,'awaiting_plan');assert.equal(calls,0);
 await e.execute(r);assert.equal(r.status,'awaiting_files');assert.equal(calls,0);assert.ok(r.plan.tasks.every(t=>t.status==='done'));assert.ok(r.phases.includes('review'));
 await e.test(r);assert.equal(r.status,'completed');assert.equal(calls,1);
});
test('executor tool results feed next turn; reviewer sees separate context',async()=>{
 const e=engine(),r=run();r.plan={tasks:[{agent:'chevron',title:'Build'}]};
 let calls=0,reviewCalls=0;
 e.model=async(_r,role,messages)=>{
  if(role==='revisor'){reviewCalls++;assert.equal(messages.length,2);assert.ok(!messages.some(m=>m.role==='tool'));return {role:'assistant',content:'{"approved":true,"summary":"Reviewed","findings":[]}'};}
  calls++;
  if(calls===1)return {role:'assistant',tool_calls:[{id:'one',type:'function',function:{name:'write_file',arguments:JSON.stringify({path:'a.mjs',content:'export const a=1;'})}}]};
  assert.equal(messages.at(-1).role,'tool');return {role:'assistant',content:'Done'};
 };
 await e.execute(r);assert.equal(r.files['a.mjs'],'export const a=1;');assert.equal(r.status,'awaiting_files');assert.equal(reviewCalls,1);
});
test('review failures stop after two correction rounds',async()=>{
 const e=engine(),r=run();r.plan={tasks:[]};r.files={'a.mjs':'bad'};let fixes=0;
 e.work=async()=>{fixes++;};e.model=async()=>({content:'{"approved":false,"findings":["bug"],"summary":"Reject"}'});
 await e.execute(r);assert.equal(r.status,'review_failed');assert.equal(fixes,2);
});
test('test runner is blocked if artifact changed after review',async()=>{
 const e=engine(()=>{throw new Error('must not run');}),r=run('demo');
 await e.start(r);await e.execute(r);r.files['health.mjs']='changed';await e.test(r);assert.equal(r.status,'error');assert.match(r.error,/mudaram/);
});
test('test repair starts from approved files, without restoring rejected drafts',async()=>{
 const e=engine(),r=run();r.status='test_failed';r.test={output:'real test failure'};r.files={'a.mjs':'approved','rejected.mjs':'draft'};r.appliedFiles={'a.mjs':'approved'};
 e.work=async()=>{assert.equal(Object.hasOwn(r.files,'rejected.mjs'),false);r.files['a.mjs']='fixed';};e.review=async()=>{r.status='awaiting_files';};
 await e.repair(r);assert.equal(r.status,'awaiting_files');assert.equal(r.files['a.mjs'],'fixed');assert.equal(r.testRepairs,1);
});
test('dependency outputs reach the downstream model, including read-only tasks',async()=>{
 const e=engine(),r=run();r.plan={tasks:[{id:'first',output:'evidence from first stage'},{id:'second',dependsOn:['first']}]};
 e.model=async(_r,_role,messages)=>{const input=JSON.parse(messages[1].content);assert.deepEqual(input.inputs,[{task:'first',output:'evidence from first stage'}]);return {content:'downstream result'};};
 const task=r.plan.tasks[1];await e.work(r,'scout','Check evidence',task);assert.equal(task.output,'downstream result');
});
test('blocked pipeline gate does not release a downstream task',async()=>{
 const e=engine(),r=run();r.architecture={type:'pipeline'};r.plan={tasks:[{id:'gate',agent:'scout',title:'Check',validation:true,dependsOn:[]},{id:'send',agent:'chevron',title:'Send',dependsOn:['gate']}]};let calls=0;
 e.model=async()=>{calls++;return {content:JSON.stringify({status:'blocked',summary:'No source'})};};
 await e.execute(r);assert.equal(r.status,'error');assert.equal(calls,1);assert.equal(r.plan.tasks[1].status,undefined);assert.match(r.error,/No source/);
});
