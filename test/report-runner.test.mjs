import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRunner} from '../lib/runner.mjs';
test('report-only execution completes without Docker or generated code tests',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'studio-report-'));
 try{const runner=createRunner({dataDir:dir,persist:async()=>{}});const result=await runner({id:'report',mode:'live',outputKind:'report',files:{'report.md':'# Findings\nNo repositories supplied; findings not verified.'},baseline:{}});assert.equal(result.code,0);assert.equal(result.kind,'report');assert.match(result.output,/não comprova/);}finally{await rm(dir,{recursive:true,force:true});}
});
