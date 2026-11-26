import {renderArchitectureMap} from './stage-view.js';
import {agentActivity} from './stage-model.js';
const NS='http://www.w3.org/2000/svg';
function node(tag,attrs={},text){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;}
function html(tag,cls,text){const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;}

// Original vector characters. All markup below is application-owned, never model output.
export function createMascot(agent){
 const id=agent.id,shape=agent.visual||id,c=/^#[a-f0-9]{6}$/i.test(agent.color)?agent.color:'#a99aff';
 const accessory={
  maestro:'<path d="M58 42 54 18 71 29 84 12 96 29 113 18 109 42Z" fill="url(#gold)" stroke="#ffedb1" stroke-width="2"/><circle cx="84" cy="26" r="3" fill="#fff3cb"/>',
  chevron:'<path d="m64 71-10 9 10 9m40-18 10 9-10 9" fill="none" stroke="#ffe7cc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  pixel:'<rect x="60" y="22" width="43" height="14" rx="5" fill="#fff0b5"/><rect x="66" y="17" width="10" height="11" rx="3" fill="#ffe49a"/><rect x="86" y="17" width="10" height="11" rx="3" fill="#ffe49a"/>',
  scout:'<path d="m84 15 7 15 16 5-16 6-7 16-6-16-16-6 16-5Z" fill="#cffff4"/><circle cx="120" cy="35" r="3" fill="#baffeb"/>',
  revisor:'<path d="M126 94 145 102 143 121 126 133 110 121 108 102Z" fill="#a4dcff" stroke="#e3f6ff" stroke-width="2"/><path d="m117 112 6 6 12-13" fill="none" stroke="#234b82" stroke-width="4" stroke-linecap="round"/>'
 }[shape]||'';
 const markup=`<svg xmlns="${NS}" viewBox="0 0 170 190" role="img" aria-label="Personagem ${id}" class="robot-svg">
 <defs>
 <linearGradient id="shell-${id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".85"/><stop offset=".18" stop-color="${c}"/><stop offset=".7" stop-color="${c}"/><stop offset="1" stop-color="#25213b"/></linearGradient>
 <linearGradient id="side-${id}" x1="0" x2="1"><stop stop-color="${c}"/><stop offset="1" stop-color="#24213c"/></linearGradient>
 <linearGradient id="screen-${id}" x2="0" y2="1"><stop stop-color="#202438"/><stop offset="1" stop-color="#11131d"/></linearGradient>
 <linearGradient id="gold"><stop stop-color="#fff4b3"/><stop offset=".5" stop-color="#f9c56b"/><stop offset="1" stop-color="#a86a39"/></linearGradient>
 <radialGradient id="halo-${id}"><stop stop-color="${c}" stop-opacity=".22"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
 </defs>
 <ellipse class="robot-halo" cx="85" cy="170" rx="74" ry="18" fill="url(#halo-${id})"/>
 <ellipse class="robot-shadow" cx="88" cy="169" rx="38" ry="7" fill="#000" opacity=".35"/>
 <g class="robot-body">
 <g class="robot-leg left"><rect x="57" y="139" width="17" height="21" rx="6" fill="url(#side-${id})"/><path d="M54 153h21v12H49v-6q0-6 5-6" fill="url(#shell-${id})"/></g>
 <g class="robot-leg right"><rect x="97" y="139" width="17" height="21" rx="6" fill="url(#side-${id})"/><path d="M97 153h21q5 0 5 6v6H97Z" fill="url(#shell-${id})"/></g>
 <g class="robot-arm left"><rect x="29" y="89" width="16" height="33" rx="8" fill="url(#side-${id})"/><rect x="25" y="111" width="21" height="21" rx="8" fill="url(#shell-${id})"/><path d="M31 116v8" stroke="#fff" opacity=".35" stroke-width="2"/></g>
 <g class="robot-arm right"><rect x="123" y="88" width="16" height="34" rx="8" fill="url(#side-${id})"/><rect x="126" y="112" width="21" height="21" rx="8" fill="url(#shell-${id})"/></g>
 <path d="m49 45 12-8h55q14 1 17 17v76q-1 13-14 17H61q-17-3-17-18V63q0-11 5-18" fill="url(#side-${id})"/>
 <rect x="40" y="43" width="84" height="99" rx="24" fill="url(#shell-${id})" stroke="#fff" stroke-opacity=".22"/>
 <path d="M49 68q0-17 17-17h38" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="3" stroke-linecap="round"/>
 <rect x="47" y="61" width="71" height="44" rx="16" fill="url(#screen-${id})" stroke="#fff" stroke-opacity=".2"/>
 <path d="M53 70q4-5 14-5h35" fill="none" stroke="#fff" stroke-opacity=".09" stroke-width="3"/>
 <g class="robot-eyes"><rect x="62" y="76" width="9" height="13" rx="4.5" fill="${c}"/><rect x="94" y="76" width="9" height="13" rx="4.5" fill="${c}"/></g>
 <path class="robot-mouth" d="M77 94q6 4 12 0" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"/>
 <rect x="64" y="116" width="36" height="13" rx="6.5" fill="#171529" opacity=".35"/>
 <circle class="robot-led" cx="73" cy="122.5" r="3" fill="#dcfff2"/><path d="M81 122h11" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/>
 ${accessory}
 </g></svg>`;
 return new DOMParser().parseFromString(markup,'image/svg+xml').documentElement;
}

export function summarize(run,agents){
 const events=run?.events||[],counts=Object.fromEntries(agents.map(a=>[a.id,0])),links=new Map();let previous=null;
 for(const event of events){if(!Object.hasOwn(counts,event.agent))continue;counts[event.agent]++;if(previous&&previous!==event.agent){const key=previous+'>'+event.agent;links.set(key,{from:previous,to:event.agent,count:(links.get(key)?.count||0)+1});}previous=event.agent;}
 const tasks=run?.plan?.tasks||[];
 const completed=tasks.filter(t=>t.status==='done').length;
 return {events,counts,links:[...links.values()],tasks,completed,files:Object.keys(run?.files||{}).length};
}

export function renderDashboard(run,agents,selected,onSelect){
 const data=summarize(run,agents),root=document.querySelector('#graph');if(!root)return;
 renderArchitectureMap(root,run,agents,selected,onSelect);
 const metrics=document.querySelector('#visual-metrics');metrics.replaceChildren();
 for(const [value,label] of [[data.files,'Arquivos preparados'],[data.events.length,'Eventos registrados'],[run?.usage?.calls||0,'Chamadas ao modelo'],[run?.usage?.calls&& !run?.usage?.tokens?'—':run?.usage?.tokens||0,'Tokens informados']]){
  const card=html('div','metric-card');card.append(html('b','',String(value)),html('span','',label));metrics.append(card);
 }
 const chart=document.querySelector('#activity-chart');chart.replaceChildren();const max=Math.max(1,...Object.values(data.counts));
 for(const a of agents){const row=html('div','chart-row');row.dataset.agent=a.id;row.append(html('span','chart-label',a.name));const track=html('div','chart-track');const bar=html('div','chart-bar');bar.style.width=(data.counts[a.id]/max*100)+'%';bar.style.backgroundColor=a.color;track.append(bar);row.append(track,html('b','chart-value',String(data.counts[a.id])));chart.append(row);}
 const progress=document.querySelector('#task-progress');progress.replaceChildren();
 const pct=data.tasks.length?data.completed/data.tasks.length:0;
 const svg=node('svg',{viewBox:'0 0 100 100',role:'img','aria-label':`${data.completed} de ${data.tasks.length} tarefas concluídas`,class:'progress-ring'});
 svg.append(node('circle',{cx:50,cy:50,r:41,class:'ring-track'}),node('circle',{cx:50,cy:50,r:41,class:'ring-value','stroke-dasharray':`${pct*257.61} 257.61`,transform:'rotate(-90 50 50)'}),node('text',{x:50,y:51,'text-anchor':'middle',class:'ring-label'},`${data.completed}/${data.tasks.length}`),node('text',{x:50,y:65,'text-anchor':'middle',class:'ring-caption'},'tarefas'));
 progress.append(svg);
 const detail=html('div','progress-detail');detail.append(html('b','',data.tasks.length?'Execução do plano':'Aguardando o primeiro plano'),html('p','',data.tasks.length?'Cada tarefa avança quando sua execução termina. Revisão e testes são verificados separadamente.':'O progresso aparece quando o Maestro organiza as tarefas.'));progress.append(detail);
 const pipeline=document.querySelector('#visual-pipeline');pipeline.replaceChildren();
 const done=run?.phases||[];
 for(const [id,label] of [['plan','Plano'],['execution','Execução'],['review','Revisão'],['approval','Aprovação'],['tests','Testes']]){const step=html('div','pipeline-step'+(done.includes(id)?' complete':''));step.append(html('span','',done.includes(id)?'✓':'·'),html('b','',label));pipeline.append(step);}
 const inspector=document.querySelector('#agent-inspector');inspector.replaceChildren();const a=agents.find(a=>a.id===selected)||agents[0];if(!a)return;
 const activity=agentActivity(run,a),own=data.tasks.filter(t=>t.agent===a.id);
 inspector.append(html('p','inspector-status',activity.label));
 for(const task of own){const box=html('details','inspector-task');box.open=task.status==='working';box.append(html('summary','',task.title));box.append(html('p','','Dependências: '+((task.dependsOn||[]).join(', ')||'nenhuma')));if(task.contract)for(const [key,label] of [['delivery','Entrega'],['format','Formato'],['trigger','Gatilho'],['validation','Validação']])box.append(html('p','',label+': '+task.contract[key]));if(task.output)box.append(html('pre','',task.output));inspector.append(box);}
 const events=data.events.filter(e=>e.agent===a.id);const heading=html('div','inspector-title');heading.append(html('b','',a.name),html('span','',a.role));inspector.append(heading);
 if(!events.length)inspector.append(html('p','inspector-empty','Nenhuma atividade registrada para este especialista.'));
 for(const event of events.slice(-3).reverse()){const item=html('div','inspector-event');item.append(html('time','',new Date(event.time).toLocaleTimeString()),html('p','',event.message));inspector.append(item);}
}
