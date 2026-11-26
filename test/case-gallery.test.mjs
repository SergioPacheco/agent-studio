import test from 'node:test';
import assert from 'node:assert/strict';
import {caseDiagram,CASE_REASONS} from '../public/case-gallery.js';
test('every classroom case has a rationale and complete ideal topology',()=>{
 const types=['pipeline','supervisor','hierarchical','pipeline','network','single'];
 for(let i=0;i<6;i++){const id='case-'+(i+1),d=caseDiagram(id,types[i]);assert.ok(CASE_REASONS[id].length>30);assert.ok(d.nodes.length);for(const [a,b] of d.edges){assert.ok(d.nodes[a]);assert.ok(d.nodes[b]);}}
 assert.equal(caseDiagram('case-1','pipeline').nodes.length,4);
 assert.equal(caseDiagram('case-6','single').nodes.length,2);
});
