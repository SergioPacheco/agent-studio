import test from 'node:test';
import assert from 'node:assert/strict';
import {stageModel,casePreview,agentActivity} from '../public/stage-model.js';
const agents=[{id:'maestro',kind:'coordinator',name:'Maestro'},{id:'chevron',kind:'worker',name:'Chevron'},{id:'pixel',kind:'worker',name:'Pixel'},{id:'scout',kind:'worker',name:'Scout'},{id:'revisor',kind:'reviewer',name:'Revisor'}];
test('six clearly marked previews cover all layouts without live activity',()=>{
 const types=['pipeline','supervisor','hierarchical','pipeline','network','single'];
 for(let i=0;i<6;i++){const r=casePreview({id:'case-'+(i+1),architecture:types[i],judge:'Check'},agents);const m=stageModel(r,agents);assert.equal(m.type,types[i]);assert.equal(m.preview,true);assert.ok(m.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)));assert.ok(m.links.every(l=>!l.live));}
});
test('consecutive log events are never treated as messages',()=>{
 const m=stageModel({status:'executing',agents:{chevron:'working'},events:[{agent:'maestro'},{agent:'chevron'}]},agents);assert.equal(m.links.length,0);
});
test('only dependency delivery to a working task is animated',()=>{
 const r={status:'executing',architecture:{type:'pipeline'},agents:{chevron:'done',pixel:'working'},plan:{tasks:[{id:'a',agent:'chevron',status:'done',dependsOn:[],contract:{delivery:'Evidence'}},{id:'b',agent:'pixel',status:'working',dependsOn:['a']}]}};
 const m=stageModel(r,agents);assert.equal(m.links.filter(l=>l.kind==='dependency').length,1);assert.equal(m.links[0].live,true);assert.equal(m.links[0].label,'Evidence');
 r.status='error';assert.equal(stageModel(r,agents).links[0].live,false);
});
test('agent states distinguish planning, review, blocked dependencies and approval',()=>{
 assert.equal(agentActivity({status:'planning',agents:{maestro:'working'}},agents[0]).label,'Planejando');
 assert.equal(agentActivity({status:'reviewing',agents:{revisor:'working'}},agents[4]).label,'Revisando');
 const r={status:'error',agents:{},plan:{tasks:[{id:'a',status:'error',agent:'chevron',dependsOn:[]},{id:'b',agent:'pixel',dependsOn:['a']}]}};
 assert.equal(agentActivity(r,agents[2]).label,'Bloqueado');
});
test('coordinator error and command waiting do not appear available',()=>{
 assert.equal(agentActivity({status:'error',agents:{maestro:'error'}},agents[0]).label,'Falhou');
});
test('integration-only executors do not overlap domain executors',()=>{
 const custom=[...agents,{id:'integration',kind:'worker',name:'Integration'}];
 const tasks=[{id:'a',agent:'chevron',domain:'back',dependsOn:[]},{id:'b',agent:'pixel',domain:'front',dependsOn:[]},{id:'c',agent:'scout',domain:'data',dependsOn:[]},{id:'d',agent:'integration',domain:'integration',dependsOn:['a','b','c']}];
 const m=stageModel({architecture:{type:'hierarchical'},plan:{tasks}},custom),a=m.nodes.find(n=>n.id==='pixel'),b=m.nodes.find(n=>n.id==='integration');assert.ok(b.y>=a.y+220);
});
test('large network gives characters separate rows and columns',()=>{
 const custom=Array.from({length:10},(_,i)=>({id:'w'+i,kind:'worker'}));const m=stageModel({architecture:{type:'network'},plan:{tasks:custom.map(a=>({id:a.id,agent:a.id,dependsOn:[]}))}},custom);
 for(const a of m.nodes)for(const b of m.nodes)if(a.id!==b.id)assert.ok(Math.abs(a.y-b.y)>=220||Math.abs(a.x-b.x)>=200);
});
test('reused agent pair labels the delivery currently being consumed',()=>{
 const r={status:'executing',architecture:{type:'pipeline'},agents:{},plan:{tasks:[{id:'a',agent:'chevron',status:'done',dependsOn:[],contract:{delivery:'First'}},{id:'b',agent:'pixel',status:'done',dependsOn:['a']},{id:'c',agent:'chevron',status:'done',dependsOn:['b'],contract:{delivery:'Current'}},{id:'d',agent:'pixel',status:'working',dependsOn:['c']}]}};
 const link=stageModel(r,agents).links.find(l=>l.from==='chevron'&&l.to==='pixel');assert.equal(link.label,'Current');assert.equal(link.task,'d');
});
