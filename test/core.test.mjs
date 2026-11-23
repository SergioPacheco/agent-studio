import test from 'node:test';
import assert from 'node:assert/strict';
import {safePath,stageFile,validatePlan,fingerprint,diffFiles,parseJSON} from '../lib/core.mjs';
test('blocks traversal, absolute paths and unsafe file types',()=>{
 for(const p of ['../secret','/tmp/a.mjs','a/../../x.js','a\\x.js','.env','a.sh','a//b.js','a/./b.js'])assert.throws(()=>safePath(p));
 assert.equal(safePath('src/health.mjs'),'src/health.mjs');
});
test('enforces file and workspace budgets',()=>{
 assert.throws(()=>stageFile({},'x.mjs','x'.repeat(100001)));
 let files={};for(let i=0;i<30;i++)files=stageFile(files,i+'.mjs','');
 assert.throws(()=>stageFile(files,'31.mjs',''));
 assert.equal(stageFile(files,'0.mjs','updated')['0.mjs'],'updated');
});
test('plan cannot invent roles, duplicate IDs or cyclic dependencies',()=>{
 const t={id:'api',agent:'chevron',title:'Build',dependsOn:[]};
 assert.equal(validatePlan({tasks:[t]}).tasks.length,1);
 for(const tasks of [[{...t,agent:'root'}],[t,t],[{...t,dependsOn:['api']}],[{...t,dependsOn:['missing']}]])assert.throws(()=>validatePlan({tasks}));
});
test('fingerprint is stable and changes when contents change',()=>{
 assert.equal(fingerprint({a:'1',b:'2'}),fingerprint({b:'2',a:'1'}));
 assert.notEqual(fingerprint({a:'1'}),fingerprint({a:'2'}));
 assert.deepEqual(diffFiles({a:'1'},{a:'2',b:'3'}).map(x=>x.path),['a','b']);
 assert.deepEqual(parseJSON('{"ok":true}'),{ok:true});
});
