import test from 'node:test';import assert from 'node:assert/strict';import {publicURL,publicIPv4,plainHTML} from '../lib/web.mjs';import {transcribeAudio} from '../lib/voice.mjs';import {writeFile,mkdtemp,rm} from 'node:fs/promises';import {join,dirname} from 'node:path';import {tmpdir} from 'node:os';
test('public web research rejects internal addresses, credentials and private DNS answers',async()=>{
 for(const url of ['http://127.0.0.1','http://2130706433','http://10.0.0.1','file:///etc/passwd','https://user:pass@example.com','http://example.com:3000'])await assert.rejects(()=>publicURL(url));
 await assert.rejects(()=>publicURL('https://example.com',async()=>[{address:'192.168.1.1',family:4}]),/privado/);assert.ok(publicIPv4('8.8.8.8'));assert.equal(publicIPv4('169.254.169.254'),false);assert.equal(plainHTML('<script>bad()</script><p>Real &amp; text</p>'),'Real & text');
});
test('local voice transcription passes audio to configured process, never invents text',async()=>{
 const text=await transcribeAudio(Buffer.from('audio'),{env:{STUDIO_STT_COMMAND:'["whisper"]'},runner:async(_exe,args)=>{const dir=args[args.indexOf('--output_dir')+1];await writeFile(join(dir,'audio.json'),'{"text":"Pedido ditado"}');return {code:0};}});assert.equal(text,'Pedido ditado');await assert.rejects(()=>transcribeAudio(Buffer.from('audio'),{env:{}}),/não configurada/);
});
