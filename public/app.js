const $=s=>document.querySelector(s);
let agents=[],runs=[],current=null,tab='activity',online=false;
const labels={planning:'Planejando',awaiting_plan:'Aprovar plano',executing:'Executando',reviewing:'Revisando',awaiting_files:'Aprovar arquivos',testing:'Testando',completed:'Concluído',test_failed:'Testes falharam',review_failed:'Revisão não aprovada',error:'Erro',cancelled:'Cancelado',interrupted:'Interrompido'};
const states={idle:'Disponível',working:'Trabalhando',done:'Concluído',waiting:'Aguardando',error:'Atenção'};
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
async function api(path,options={}){const r=await fetch(path,{...options,headers:{'Content-Type':'application/json'}});const d=await r.json();if(!r.ok)throw new Error(d.error||'Erro na requisição');return d;}
function notify(e){$('#notice').textContent=e?.message||e||'';}
function renderAgents(){
 const root=$('#agents');root.replaceChildren();
 for(const a of agents){
  const state=current?.agents[a.id]||'idle';const card=el('div','agent '+state);
  const last=current?.events.filter(e=>e.agent===a.id).at(-1);
  card.append(el('div','speech',state==='working'?(last?.message||'Trabalhando').slice(0,45):''));
  const mascot=el('div','mascot');mascot.style.setProperty('--c',a.color);mascot.append(el('span','face',a.icon));
  card.append(mascot,el('b','',a.name),el('small','',a.role),el('span','agent-state',states[state]));
  root.append(card);
 }
}
function renderHistory(){
 $('#history').replaceChildren();
 for(const r of runs){
  const b=el('button','history-item'+(r.id===current?.id?' current':''),r.prompt.slice(0,65));
  b.append(el('small','',(r.mode==='demo'?'DEMO':'IA')+' · '+(labels[r.status]||r.status)+' · '+new Date(r.createdAt).toLocaleDateString()));
  b.onclick=()=>{current=r;notify('');render();};$('#history').append(b);
 }
}
async function action(name){
 if(!current)return;const id=current.id;const buttons=[...$('#approval').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{await api('/api/runs/'+id+'/'+name,{method:'POST',body:'{}'});current=await api('/api/runs/'+id);notify('');render();}catch(e){notify(e);buttons.forEach(b=>b.disabled=false);}
}
function renderApproval(){
 const root=$('#approval');root.replaceChildren();
 if(!current)return;
 let text,button,act;
 if(current.status==='awaiting_plan'){text='Confira a distribuição de tarefas antes de autorizar a execução.';button='Aprovar plano';act='approve-plan';}
 if(current.status==='awaiting_files'){text='Confira os arquivos e a revisão. Aprovar salva uma cópia e executa testes. No modo IA, Docker é obrigatório.';button='Aprovar arquivos e testar';act='approve-files';}
 if(text){
  const box=el('div','approval');box.append(el('b','',button),el('p','',text));const row=el('div','approval-actions');
  const yes=el('button','primary',button);yes.onclick=()=>action(act);const no=el('button','danger','Recusar');no.onclick=()=>action('cancel');row.append(yes,no);box.append(row);root.append(box);
 }else if(['planning','executing','reviewing','testing'].includes(current.status)){
  const box=el('div','approval');const b=el('button','danger','Cancelar execução');b.onclick=()=>action('cancel');box.append(b);root.append(box);
 }
}
function renderContent(){
 const root=$('#content');root.replaceChildren();
 if(!current){root.append(el('div','empty','As ideias começam aqui. Envie seu primeiro pedido.'));return;}
 if(tab==='activity'){
  for(const e of current.events){
   const row=el('div','event'),a=agents.find(a=>a.id===e.agent);row.append(el('span','event-avatar',a?.icon||'·'));const body=el('div');body.append(el('strong','',a?.name||e.agent),el('time','',new Date(e.time).toLocaleTimeString()),el('p','',e.message));row.append(body);root.append(row);
  }
  root.append(el('div','metrics',current.mode==='demo'?'DEMO: decisões fixas · sem chamadas a IA':'IA: '+current.usage.calls+' chamadas · '+current.usage.tokens+' tokens informados pelo provedor'));
 }
 if(tab==='plan'){
  if(!current.plan)root.append(el('div','empty','Preparando o plano...'));
  else{for(const p of current.proposals||[])root.append(el('p','',p.agent+' · '+(p.assume?'Assume: ':'Passa: ')+p.reason));root.append(el('p','',current.plan.summary));for(const t of current.plan.tasks){const card=el('div','task',t.title);card.append(el('small','',t.agent+' · dependências: '+(t.dependsOn.join(', ')||'nenhuma')));root.append(card);}}
 }
 if(tab==='files'){
  if(!Object.keys(current.files).length)root.append(el('div','empty','Nenhum arquivo preparado ainda.'));
  for(const [path,content] of Object.entries(current.files)){
   const d=el('details');d.append(el('summary','',path+' · novo arquivo'));
   const pre=el('pre');for(const line of content.split('\n'))pre.append(el('div','diff-add','+ '+line));d.append(pre);root.append(d);
  }
  if(current.review){root.append(el('h3','',current.review.approved?'Revisão aprovada':'Achados da revisão'));root.append(el('p','',current.review.summary));for(const item of current.review.findings)root.append(el('p','',item));}
  const a=el('a','download','↓ Exportar artefatos e evidências (JSON)');a.href='/api/runs/'+current.id+'/files';a.download='artifacts.json';root.append(a);
 }
 if(tab==='tests'){
  if(!current.test)root.append(el('div','empty',current.error||'Testes ainda não executados. Aprove os arquivos para iniciar.'));
  else{root.append(el('p','',current.test.code===0?'✓ Testes passaram':'✕ Testes falharam'),el('pre','',current.test.command+'\n\n'+current.test.output));}
 }
}
function render(){
 renderAgents();renderHistory();renderApproval();renderContent();
 $('#status').textContent=current?(labels[current.status]||current.status):'Pronto para começar';
 $('#caption').textContent=current?(current.mode==='demo'?'Demonstração fixa · ':'IA conectada · ')+(labels[current.status]||current.status):'Uma equipe pronta para transformar seu próximo pedido em algo real.';
 if(current?.error)notify(current.error);
 $('#submit').disabled=!online||runs.some(r=>['planning','executing','reviewing','testing'].includes(r.status));
}
async function refresh(){runs=await api('/api/runs');if(current)current=runs.find(r=>r.id===current.id)||current;else current=runs[0]||null;render();}
$('#request').onsubmit=async e=>{
 e.preventDefault();notify('');$('#submit').disabled=true;
 try{current=await api('/api/runs',{method:'POST',body:JSON.stringify({mode:$('#mode').value,prompt:$('#prompt').value})});runs.unshift(current);tab='activity';document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));render();}catch(e){notify(e);$('#submit').disabled=false;}
};
$('#example').onclick=()=>$('#prompt').value='Crie um módulo health que retorne status ok, com documentação e teste.';
$('#mode').onchange=()=>$('#mode-note').textContent=$('#mode').value==='demo'?'Sem LLM: gera o exemplo health e executa um teste real. Seu pedido não altera o cenário.':'Pedido livre enviado ao provedor configurado. Os arquivos serão revisados e os testes gerados exigem Docker.';
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('selected',t===b));renderContent();});
$('#refresh').onclick=()=>refresh().catch(notify);
(async()=>{
 try{
  const config=await api('/api/config');agents=config.agents;
  $('#mode').options[1].disabled=!config.liveAvailable;
  const events=new EventSource('/api/events');
  events.onopen=()=>{online=true;$('#connection').textContent='Conectado';refresh().catch(notify);};
  events.onerror=()=>{online=false;$('#connection').textContent='Reconectando';$('#submit').disabled=true;};
  events.onmessage=e=>{const r=JSON.parse(e.data);const i=runs.findIndex(x=>x.id===r.id);if(i<0)runs.unshift(r);else runs[i]=r;if(!current||current.id===r.id)current=r;render();};
  await refresh();
 }catch(e){notify(e);}
})();
