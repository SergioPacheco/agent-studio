import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,symlink,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {snapshot,applyChanges,restoreBackup} from '../lib/projects.mjs';
test('project edits are selected, conflict checked, backed up and restorable',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-project-')),backups=await mkdtemp(join(tmpdir(),'studio-backup-'));
 try{await writeFile(join(root,'a.mjs'),'old');await writeFile(join(root,'.env'),'SECRET=value');await writeFile(join(root,'auth.json'),'secret');const before=await snapshot(root);assert.deepEqual(before.files,{'a.mjs':'old'});
  const result=await applyChanges({root,baseline:before.files,files:{'a.mjs':'new','b.mjs':'extra'},selected:['a.mjs'],backupDir:join(backups,'one')});assert.equal(await readFile(join(root,'a.mjs'),'utf8'),'new');assert.deepEqual(result.files,{'a.mjs':'new'});
  await writeFile(join(root,'a.mjs'),'external');await assert.rejects(()=>restoreBackup(result.backup),/mudou/);await writeFile(join(root,'a.mjs'),'new');await restoreBackup(result.backup);assert.equal(await readFile(join(root,'a.mjs'),'utf8'),'old');
  await assert.rejects(()=>applyChanges({root,baseline:{'a.mjs':'stale'},files:{'a.mjs':'oops'},selected:['a.mjs'],backupDir:join(backups,'two')}),/Conflito/);assert.equal(await readFile(join(root,'a.mjs'),'utf8'),'old');
 }finally{await rm(root,{recursive:true,force:true});await rm(backups,{recursive:true,force:true});}
});
test('project snapshot and writes never follow symlinks',async()=>{
 const root=await mkdtemp(join(tmpdir(),'studio-links-')),outside=await mkdtemp(join(tmpdir(),'studio-outside-'));
 try{await writeFile(join(outside,'secret.mjs'),'private');await symlink(outside,join(root,'link'),'dir');assert.deepEqual((await snapshot(root)).files,{});await assert.rejects(()=>applyChanges({root,baseline:{},files:{'link/secret.mjs':'overwrite'},selected:['link/secret.mjs'],backupDir:join(root,'backups')}),/inseguro/);assert.equal(await readFile(join(outside,'secret.mjs'),'utf8'),'private');}finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});
