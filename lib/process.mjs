import {spawn} from 'node:child_process';
export function command(executable,args=[],{cwd,signal,timeout=120000,input,env:extraEnv={},maxOutput=1000000}={}){
 if(typeof executable!=='string'||!executable||!Array.isArray(args)||args.some(a=>typeof a!=='string'))throw new Error('Comando deve ser executável e lista de argumentos.');
 return new Promise((resolve,reject)=>{
  if(signal?.aborted)return reject(new Error('Cancelado'));
  const env={...process.env,...extraEnv};delete env.NODE_TEST_CONTEXT;
  const child=spawn(executable,args,{cwd,env,stdio:['pipe','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true});
  let stdout='',stderr='',timedOut=false,overflow=false,settled=false;
  const kill=()=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}};
  const abort=()=>kill();signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>{timedOut=true;kill();},timeout);
  const collect=(which,b)=>{if(which==='out')stdout+=b.toString();else stderr+=b.toString();if(stdout.length+stderr.length>maxOutput){overflow=true;stdout=stdout.slice(0,maxOutput);stderr=stderr.slice(0,maxOutput-stdout.length);kill();}};
  child.stdout.on('data',b=>collect('out',b));child.stderr.on('data',b=>collect('err',b));
  const clean=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);};
  child.on('error',e=>{clean();if(!settled){settled=true;reject(new Error(e.code==='ENOENT'?'Executável não encontrado: '+executable:e.message));}});
  child.on('close',(code,sig)=>{clean();if(settled)return;settled=true;
   if(signal?.aborted)return reject(new Error('Cancelado'));
   resolve({code:code??1,stdout,stderr,output:stdout+stderr+(timedOut?'\nTempo limite excedido.':'')+(overflow?'\nSaída excedeu o limite.':''),command:JSON.stringify([executable,...args]),timedOut,signal:sig});
  });
  child.stdin.on('error',()=>{});child.stdin.end(input||'');
 });
}
