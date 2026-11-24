import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
async function check(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+item.name;if(item.isDirectory()){if(!['node_modules','.git','.studio','docs','release'].includes(item.name))await check(path);}else if(/\.(mjs|cjs|js)$/.test(path)){const result=spawnSync(process.execPath,['--check',path],{stdio:'inherit'});if(result.status!==0)process.exit(result.status||1);}}}
await check('.');
