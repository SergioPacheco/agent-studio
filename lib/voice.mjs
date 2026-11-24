import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {command} from './process.mjs';
export async function transcribeAudio(bytes,{env=process.env,runner=command}={}){
 if(!env.STUDIO_STT_COMMAND)throw new Error('Transcrição local não configurada. Defina STUDIO_STT_COMMAND com executável Whisper.');
 const executable=JSON.parse(env.STUDIO_STT_COMMAND);if(!Array.isArray(executable)||!executable.length||executable.some(x=>typeof x!=='string'))throw new Error('STUDIO_STT_COMMAND deve ser uma lista JSON.');
 if(!bytes.length||bytes.length>15000000)throw new Error('Áudio vazio ou maior que 15 MB.');const dir=await mkdtemp(join(tmpdir(),'studio-voice-'));
 try{const file=join(dir,'audio.webm');await writeFile(file,bytes);const result=await runner(executable[0],[...executable.slice(1),file,'--model',env.STUDIO_STT_MODEL||'base','--output_format','json','--output_dir',dir],{cwd:dir,timeout:180000});if(result.code!==0)throw new Error('Whisper local falhou. Confira instalação/modelo.');const output=JSON.parse(await readFile(join(dir,'audio.json'),'utf8'));if(typeof output.text!=='string')throw new Error('Transcrição sem texto.');return output.text.slice(0,4000);}finally{await rm(dir,{recursive:true,force:true});}
}
