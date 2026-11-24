import {mkdir,readFile,writeFile,rename,readdir} from 'node:fs/promises';
import {join,dirname} from 'node:path';
export class Store{
 constructor(root){this.root=root;this.queues=new Map();}
 async read(name,fallback){try{return JSON.parse(await readFile(join(this.root,name+'.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw e;}}
 write(name,value){const text=JSON.stringify(value,null,2);const next=(this.queues.get(name)||Promise.resolve()).catch(()=>{}).then(async()=>{const path=join(this.root,name+'.json');await mkdir(dirname(path),{recursive:true});await writeFile(path+'.tmp',text,{mode:0o600});await rename(path+'.tmp',path);});this.queues.set(name,next);return next;}
 async list(folder){await mkdir(join(this.root,folder),{recursive:true});return (await readdir(join(this.root,folder))).filter(x=>/^[a-zA-Z0-9-]+\.json$/.test(x)).map(x=>folder+'/'+x.slice(0,-5));}
}
