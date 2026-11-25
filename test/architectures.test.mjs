import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES,validateArchitecture,constrainTasks} from '../lib/architectures.mjs';
test('six cases cover all five architectures',()=>{
 assert.deepEqual(CASES.map(c=>c.architecture),['pipeline','supervisor','hierarchical','pipeline','network','single']);
 assert.equal(new Set(CASES.map(c=>c.id)).size,6);
});
test('architecture rejects unsupported types and unbounded debates',()=>{
 assert.throws(()=>validateArchitecture({type:'unknown'}));
 assert.throws(()=>validateArchitecture({type:'network',rationale:'x',judge:'arbiter',rounds:4}));
});
test('pipeline enforces actual handoffs; single enforces one worker',()=>{
 const tasks=[{id:'a',agent:'a',dependsOn:[]},{id:'b',agent:'b',dependsOn:[]}];
 assert.deepEqual(constrainTasks(tasks,{type:'pipeline'})[1].dependsOn,['a']);
 assert.throws(()=>constrainTasks(tasks,{type:'single'}));
});
test('network critic receives previous round dependencies and bounded rounds',()=>{
 const a=validateArchitecture({type:'network',rationale:'Compare alternatives',judge:'External reviewer',rounds:2});
 const t=constrainTasks([{id:'a',agent:'one',round:1,dependsOn:[]},{id:'b',agent:'two',round:1,dependsOn:[]},{id:'c',agent:'one',round:2,dependsOn:[]}],a);
 assert.deepEqual(t[2].dependsOn,['a','b']);
 assert.throws(()=>constrainTasks([{id:'a',round:2,dependsOn:[]}],a));
});
test('hierarchical plans require domains and explicit local validation',()=>{
 assert.throws(()=>constrainTasks([{id:'a',dependsOn:[]}],{type:'hierarchical'}));
 assert.throws(()=>constrainTasks([{id:'a',domain:'back',dependsOn:[]}],{type:'hierarchical'}));
});
test('valid hierarchy integrates only after each domain gate',()=>{
 const tasks=[{id:'back',domain:'back',agent:'a',dependsOn:[]},{id:'back-check',domain:'back',validation:true,agent:'b',dependsOn:['back']},{id:'front',domain:'front',agent:'c',dependsOn:[]},{id:'front-check',domain:'front',validation:true,agent:'b',dependsOn:['front']},{id:'join',domain:'integration',agent:'a',dependsOn:['back-check','front-check']}];
 assert.equal(constrainTasks(tasks,{type:'hierarchical'}).length,5);
});
import {verifyReportArtifacts,validateGate} from '../lib/architectures.mjs';
test('report verification rejects empty reports and code changes',()=>{
 assert.throws(()=>verifyReportArtifacts({'report.md':''},{}));
 assert.throws(()=>verifyReportArtifacts({'report.md':'analysis','a.js':'changed'},{'a.js':'old'}));
 assert.equal(verifyReportArtifacts({'report.md':'Evidence and limitations'},{}).kind,'report');
});
test('gates stop blocked or malformed outcomes',()=>{
 assert.throws(()=>validateGate('plain opinion'));
 assert.throws(()=>validateGate(JSON.stringify({status:'blocked',summary:'Missing source'})),/Missing source/);
 assert.equal(validateGate(JSON.stringify({status:'pass',summary:'Source checked'})).status,'pass');
});
import {validateContracts} from '../lib/architectures.mjs';
test('contracts and nondegenerate structures are mandatory',()=>{
 assert.throws(()=>validateContracts([{id:'a'}]));
 assert.throws(()=>constrainTasks([{id:'a',domain:'integration',dependsOn:[]}],{type:'hierarchical'}));
 assert.throws(()=>constrainTasks([{id:'a',agent:'one',round:1,dependsOn:[]}],{type:'network',rounds:1}));
 assert.throws(()=>constrainTasks([{id:'a',dependsOn:[]}],{type:'supervisor'}));
 assert.equal(constrainTasks([{id:'a',dependsOn:[]},{id:'summary',consolidation:true,dependsOn:['a']}],{type:'supervisor'}).length,2);
});
