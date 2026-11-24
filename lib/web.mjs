import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import http from 'node:http';
import https from 'node:https';
export function publicIPv4(ip){if(isIP(ip)!==4)return false;const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19)||a===198&&b===51||a===203&&b===0);}
export async function publicURL(input,resolver=lookup){const url=new URL(input);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port&&!['80','443'].includes(url.port))throw new Error('Apenas URLs públicas HTTP/HTTPS sem credenciais são permitidas.');const addresses=isIP(url.hostname)?[{address:url.hostname,family:4}]:await resolver(url.hostname,{all:true,family:4});if(!addresses.length||addresses.some(a=>!publicIPv4(a.address)))throw new Error('Endereço privado, reservado ou sem IPv4 público.');return {url,address:addresses[0].address};}
export async function fetchPublic(input,{signal,headers={},redirects=0}={}){
 if(redirects>3)throw new Error('Redirecionamentos excessivos.');const {url,address}=await publicURL(input);
 const result=await new Promise((resolve,reject)=>{
  const req=(url.protocol==='https:'?https:http).request(url,{method:'GET',headers:{'User-Agent':'AgentStudio/2.0 (public research)',...headers},signal,lookup:(_host,opts,cb)=>opts.all?cb(null,[{address,family:4}]):cb(null,address,4)},res=>{
   if(res.statusCode>=300&&res.statusCode<400&&res.headers.location){res.resume();resolve({redirect:new URL(res.headers.location,url).href});return;}
   if(res.statusCode!==200){res.resume();reject(new Error('Fonte retornou HTTP '+res.statusCode));return;}
   if(!/text\/|application\/json/.test(res.headers['content-type']||'')){res.resume();reject(new Error('Fonte não é texto/HTML/JSON.'));return;}
   let data='';res.setEncoding('utf8');res.on('data',chunk=>{data+=chunk;if(Buffer.byteLength(data)>600000)req.destroy(new Error('Página excede 600 KB.'));});res.on('end',()=>resolve({url:url.href,text:data}));res.on('error',reject);
  });req.setTimeout(12000,()=>req.destroy(new Error('Tempo limite da fonte.')));req.on('error',reject);req.end();
 });return result.redirect?fetchPublic(result.redirect,{signal,headers:{},redirects:redirects+1}):result;
}
export function plainHTML(html){return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();}
export async function searchWeb(query,{signal,env=process.env}={}){
 if(typeof query!=='string'||!query.trim()||query.length>500)throw new Error('Consulta de pesquisa inválida.');
 if(env.BRAVE_SEARCH_API_KEY){const r=await fetchPublic('https://api.search.brave.com/res/v1/web/search?q='+encodeURIComponent(query)+'&count=5',{signal,headers:{'X-Subscription-Token':env.BRAVE_SEARCH_API_KEY}});const json=JSON.parse(r.text);return (json.web?.results||[]).slice(0,5).map(x=>({title:x.title,url:x.url,excerpt:plainHTML(x.description||'')}));}
 const r=await fetchPublic('https://html.duckduckgo.com/html/?q='+encodeURIComponent(query),{signal});const matches=[...r.text.matchAll(/<a\b[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
 const sources=[];for(const match of matches){let href=match[1].replace(/&amp;/g,'&');const u=new URL(href,'https://duckduckgo.com');href=u.searchParams.get('uddg')||u.href;if(!sources.some(s=>s.url===href))sources.push({url:href,title:plainHTML(match[2]),excerpt:''});if(sources.length===5)break;}
 if(!sources.length)throw new Error('Pesquisa sem resultados extraíveis. Configure BRAVE_SEARCH_API_KEY ou forneça uma URL para leitura.');return sources;
}
