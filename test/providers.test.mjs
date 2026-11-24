import test from 'node:test';import assert from 'node:assert/strict';
import {ProviderRouter,cliArgs,decodeCLI} from '../lib/providers.mjs';
for(const type of ['claude-cli','codex-cli','gemini-cli'])test(type+' uses existing CLI auth and structured responses, without API fallback',async()=>{
 let invocation;const catalog={agents:[{id:'agent',provider:'cli',model:'example'}],providers:[{id:'cli',type,name:type,enabled:true}]};
 const content=JSON.stringify({content:'done'}),stdout=type==='codex-cli'?JSON.stringify({type:'item.completed',item:{type:'agent_message',text:content}}):JSON.stringify(type==='claude-cli'?{result:content}:{response:content});
 const router=new ProviderRouter({catalog,processRunner:async(executable,args,options)=>{invocation={executable,args,options};return {code:0,stdout};},fetcher:()=>{throw new Error('API must not be called');}});
 const run={usage:{calls:0,tokens:0}},result=await router.call({agent:'agent',run,messages:[{role:'user',content:'hello'}],tools:[]});assert.equal(result.content,'done');assert.equal(run.usage.calls,1);assert.equal(invocation.options.env.OPENAI_API_KEY,'');assert.ok(invocation.args.includes('example'));assert.ok(!invocation.args.some(x=>x.includes('bypass')));
});
test('CLI authentication/protocol failure does not become a fake successful answer',()=>{assert.throws(()=>decodeCLI('claude-cli','{"is_error":true}'));assert.throws(()=>decodeCLI('codex-cli','{"type":"turn.failed"}'));assert.ok(cliArgs('codex-cli','').includes('read-only'));});
for(const type of ['openai','anthropic','gemini'])test(type+' API is selected per agent and decodes tool calls',async()=>{
 let request;const catalog={agents:[{id:'agent',provider:'p',model:'model'}],providers:[{id:'p',type,name:type,enabled:true,baseUrl:'https://provider.example/v1',keyEnv:'EXAMPLE_KEY'}]};
 const raw=type==='openai'?{choices:[{message:{content:null,tool_calls:[{id:'one',function:{name:'read_file',arguments:'{"path":"a.mjs"}'}}]}}],usage:{total_tokens:12}}:type==='anthropic'?{content:[{type:'tool_use',id:'one',name:'read_file',input:{path:'a.mjs'}}],usage:{input_tokens:6,output_tokens:6}}:{candidates:[{content:{parts:[{functionCall:{name:'read_file',args:{path:'a.mjs'}}}]}}],usageMetadata:{totalTokenCount:12}};
 const router=new ProviderRouter({catalog,env:{EXAMPLE_KEY:'fixture'},fetcher:async(url,opts)=>{request={url,opts};return {ok:true,text:async()=>JSON.stringify(raw)};}});const run={usage:{calls:0,tokens:0}};const result=await router.call({agent:'agent',run,messages:[{role:'system',content:'rules'},{role:'user',content:'read'}],tools:[]});assert.equal(result.tool_calls[0].function.name,'read_file');assert.equal(run.usage.tokens,12);assert.ok(request.url.includes(type==='anthropic'?'messages':type==='gemini'?'generateContent':'chat/completions'));
});
test('Gemini preserves opaque function-call signatures and maps JSON schemas to its REST format',async()=>{
 const catalog={agents:[{id:'agent',provider:'p',model:'model'}],providers:[{id:'p',type:'gemini',name:'Gemini',enabled:true,baseUrl:'https://provider.example/v1beta',keyEnv:'KEY'}]};let sent;
 const part={functionCall:{name:'read_file',args:{path:'a.mjs'}},thoughtSignature:'opaque-signature'};
 const router=new ProviderRouter({catalog,env:{KEY:'fixture'},fetcher:async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,text:async()=>JSON.stringify({candidates:[{content:{parts:[part]}}]})};}});
 const tools=[{type:'function',function:{name:'read_file',description:'Read',parameters:{type:'object',properties:{path:{type:'string'}},required:['path'],additionalProperties:false}}}];
 const msg=await router.call({agent:'agent',messages:[{role:'user',content:'read'}],tools});assert.equal(sent.tools[0].functionDeclarations[0].parameters.type,'OBJECT');assert.equal(Object.hasOwn(sent.tools[0].functionDeclarations[0].parameters,'additionalProperties'),false);
 await router.call({agent:'agent',messages:[{role:'user',content:'read'},msg,{role:'tool',tool_call_id:msg.tool_calls[0].id,content:'file'}],tools});assert.equal(sent.contents[1].parts[0].thoughtSignature,'opaque-signature');
});
