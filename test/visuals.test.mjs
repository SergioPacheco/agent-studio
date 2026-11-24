import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from '../public/visuals.js';
const agents=[{id:'maestro'},{id:'chevron'},{id:'revisor'}];
test('visual metrics count recorded events and actual completed tasks only',()=>{
 const result=summarize({events:[{agent:'maestro'},{agent:'chevron'},{agent:'chevron'},{agent:'revisor'},{agent:'chevron'}],files:{'a.mjs':'a'},plan:{tasks:[{status:'done'},{status:'working'}]}},agents);
 assert.deepEqual(result.counts,{maestro:1,chevron:3,revisor:1});
 assert.equal(result.completed,1);assert.equal(result.tasks.length,2);assert.equal(result.files,1);
 assert.deepEqual(result.links,[{from:'maestro',to:'chevron',count:1},{from:'chevron',to:'revisor',count:1},{from:'revisor',to:'chevron',count:1}]);
});
test('empty visual state does not invent activity or progress',()=>{
 const result=summarize(null,agents);assert.equal(result.completed,0);assert.equal(result.events.length,0);assert.equal(result.links.length,0);assert.ok(Object.values(result.counts).every(n=>n===0));
});
