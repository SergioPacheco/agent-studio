import {renderCaseGallery} from './case-gallery.js';
import {renderStage} from './stage-view.js';
import {agentActivity,casePreview} from './stage-model.js';
import {mount3D} from './mascot3d.js';
import {setupStudio} from './studio.js';
import {createMascot,renderDashboard} from './visuals.js';
const $=s=>document.querySelector(s);
let agents=[],runs=[],current=null,previewRun=null,tab='activity',online=false;
function ingest(r){const old=runs.find(x=>x.id===r.id);if(old&&old.events.length>r.events.length)return old;const i=runs.findIndex(x=>x.id===r.id);if(i<0)runs.unshift(r);else runs[i]=r;return r;}
const labels={planning:'Planejando',awaiting_plan:'Aprovar plano',executing:'Executando',reviewing:'Revisando',awaiting_files:'Aprovar arquivos',testing:'Testando',completed:'Concluído',test_failed:'Testes falharam',review_failed:'Revisão não aprovada',error:'Erro',cancelled:'Cancelado',interrupted:'Interrompido',awaiting_command:'Aprovar comando'};
const states={idle:'Disponível',working:'Trabalhando',done:'Concluído',waiting:'Aguardando',error:'Atenção'};
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
async function api(path,options={}){const r=await fetch(path,{...options,headers:{'Content-Type':'application/json'}});const d=await r.json();if(!r.ok){const error=new Error(d.error||'Erro na requisição');error.authenticationRequired=d.authenticationRequired;throw error;}return d;}
function notify(e){$('#notice').textContent=e?.message||e||'';}
let selectedAgent='maestro';const renderers=new Map(),selections=new Map();
function changedFiles(){const before=current?.baseline||{},after=current?.files||{};return [...new Set([...Object.keys(before),...Object.keys(after)])].sort().filter(p=>before[p]!==after[p]);}
function selectedFiles(){const key=current?.id+':'+current?.hash;if(!selections.has(key))selections.set(key,new Set(changedFiles()));return selections.get(key);}
function selectAgent(id){selectedAgent=id;renderAgents();renderDashboard(previewRun||current,agents,selectedAgent,selectAgent);renderStage(previewRun||current,agents);}
function renderAgents(){
 const root=$('#agents');
 for(const existing of root.querySelectorAll('[data-agent]'))if(!agents.some(a=>a.id===existing.dataset.agent)){renderers.get(existing.dataset.agent)?.dispose();renderers.delete(existing.dataset.agent);existing.remove();}
 for(const a of agents){
  let card=root.querySelector('[data-agent="'+a.id+'"]');
  if(!card){
   card=el('button','agent');card.type='button';card.dataset.agent=a.id;card.setAttribute('aria-label','Inspecionar '+a.name);
   const avatar=el('div','avatar-shell'),canvas=el('canvas','avatar-canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label',a.name+' personagem 3D');canvas.tabIndex=0;avatar.append(canvas,createMascot(a));card.append(el('div','speech'),avatar,el('b','',a.name),el('small','',a.role),el('span','agent-state'));queueMicrotask(()=>{const renderer=mount3D(canvas,a);if(renderer){renderers.set(a.id,renderer);avatar.classList.add('has-webgl');avatar.dataset.renderer='webgl';}else avatar.dataset.renderer='svg';});
   card.onclick=()=>selectAgent(a.id);root.append(card);
  }
  card.querySelector('b').textContent=a.name;card.querySelector('small').textContent=a.role;renderers.get(a.id)?.update(a);
  const stageRun=previewRun||current,activity=agentActivity(stageRun,a),state=activity.state,last=stageRun?.events?.filter(e=>e.agent===a.id).at(-1);
  renderers.get(a.id)?.setState(state);card.className='agent '+state+(selectedAgent===a.id?' selected':'');card.setAttribute('aria-pressed',String(selectedAgent===a.id));
  card.querySelector('.speech').textContent=activity.task?activity.task.title.slice(0,65):last?last.message.slice(0,65):'Pronto para colaborar';
  card.querySelector('.speech').title=last?.message||'Pronto para colaborar';card.querySelector('.agent-state').textContent=activity.label;
 }
}

function renderHistory(){
 $('#history').replaceChildren();
 for(const r of runs){
  const b=el('button','history-item'+(r.id===current?.id?' current':''),r.prompt.slice(0,65));
  b.append(el('small','',(r.mode==='demo'?'DEMO':'IA')+' · '+(labels[r.status]||r.status)+' · '+new Date(r.createdAt).toLocaleDateString()));
  b.onclick=()=>{previewRun=null;current=r;notify('');render();};$('#history').append(b);
 }
}
async function action(name,payload={}){
 if(!current)return;const id=current.id;const buttons=[...$('#approval').querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
 try{await api('/api/runs/'+id+'/'+name,{method:'POST',body:JSON.stringify(name==='approve-files'?{selectedFiles:[...selectedFiles()],confirmHostTest:!!$('#confirm-host-test')?.checked,...payload}:payload)});current=ingest(await api('/api/runs/'+id));notify('');if(name==='memory')await studio.refresh();render();return true;}catch(e){notify(e);buttons.forEach(b=>b.disabled=false);return false;}
}
function renderApproval(){
 const root=$('#approval');root.replaceChildren();if(previewRun)return;
 if(!current)return;
 for(const pending of current.pendingActions||[]){if(pending.status!=='pending')continue;const box=el('div','approval command-approval');box.append(el('b','',pending.label),el('p','',pending.reason),el('pre','',JSON.stringify(pending.argv)+'\n'+pending.cwd+'\nImagem: '+pending.image));const yes=el('button','primary','Aprovar comando'),no=el('button','danger','Recusar comando');yes.onclick=()=>action('actions/'+pending.id,{approved:true});no.onclick=()=>action('actions/'+pending.id,{approved:false});box.append(yes,no);root.append(box);}
 let text,button,act;
 if(current.status==='awaiting_plan'){text='Confira a distribuição de tarefas antes de autorizar a execução.';button='Aprovar plano';act='approve-plan';}
 if(current.status==='awaiting_files'){text='Confira o diff e selecione os arquivos. '+(current.projectId?'As alterações aprovadas serão aplicadas ao projeto '+current.projectName+'. ':'Um novo projeto será salvo. ')+(current.projectConfig?.testMode==='host'?'Os testes executarão código na pasta original: ':'Testes isolados: ')+JSON.stringify(current.projectConfig?.testCommand||['node','--test']);button='Aprovar arquivos e testar';act='approve-files';if(current.outputKind==='report'){text='Confira o relatório e selecione os arquivos. A aprovação aplica os artefatos e verifica sua estrutura; não executa testes de código nem comprova os achados.';button='Aprovar e verificar relatório';}}
 if(text){
  const box=el('div','approval');box.append(el('b','',button),el('p','',text));if(current.projectConfig?.testMode==='host'&&current.status==='awaiting_files'){const label=el('label','inline-check',' Autorizo este comando na pasta original.');const check=el('input');check.type='checkbox';check.id='confirm-host-test';label.prepend(check);box.append(label);}
 const row=el('div','approval-actions');
  const yes=el('button','primary',button);yes.onclick=()=>action(act);const no=el('button','danger','Recusar');no.onclick=()=>action('cancel');row.append(yes,no);box.append(row);root.append(box);
 }else if(['planning','executing','awaiting_command','reviewing','testing'].includes(current.status)){
  const box=el('div','approval');const b=el('button','danger','Cancelar execução');b.onclick=()=>action('cancel');box.append(b);root.append(box);
 }
}
function renderContent(){
 const root=$('#content');root.replaceChildren();if(previewRun){root.append(el('h3','','Prévia didática · nenhuma execução'));for(const t of previewRun.plan.tasks){const box=el('div','task',t.title);box.append(el('small','',t.agent+' · depende de: '+(t.dependsOn.join(', ')||'nenhuma')));root.append(box);}return;}
 if(!current){root.append(el('div','empty','As ideias começam aqui. Envie seu primeiro pedido.'));return;}
 if(tab==='activity'){
  for(const e of current.events){
   const row=el('div','event'),a=agents.find(a=>a.id===e.agent);row.append(el('span','event-avatar',a?.icon||'·'));const body=el('div');body.append(el('strong','',a?.name||e.agent),el('time','',new Date(e.time).toLocaleTimeString()),el('p','',e.message));row.append(body);root.append(row);
  }
  root.append(el('div','metrics',current.mode==='demo'?'DEMO: decisões fixas · sem chamadas a IA':'IA: '+current.usage.calls+' chamadas · '+current.usage.tokens+' tokens informados pelo provedor'));
 }
 if(tab==='plan'){
  if(current.architecture){const a=current.architecture;root.append(el('h3','',a.label),el('p','',a.rationale),el('p','','Validação: '+a.judge));}
  if(!current.plan)root.append(el('div','empty','Preparando o plano...'));
  else{for(const p of current.proposals||[])root.append(el('p','',p.agent+' · '+(p.assume?'Assume: ':'Passa: ')+p.reason));root.append(el('p','',current.plan.summary));for(const t of current.plan.tasks){const card=el('div','task',t.title);card.append(el('small','',(t.status==='done'?'✓ ':t.status==='working'?'◉ ':'○ ')+t.agent+' · dependências: '+(t.dependsOn.join(', ')||'nenhuma')));if(t.domain)card.append(el('small','','Frente: '+t.domain));if(t.round)card.append(el('small','','Rodada: '+t.round));if(t.contract)card.append(el('small','','Entrega: '+t.contract.delivery+' · Formato: '+t.contract.format+' · Gatilho: '+t.contract.trigger+' · Validação: '+t.contract.validation));root.append(card);}}
 }
 if(tab==='files'){
  if(!Object.keys(current.files).length)root.append(el('div','empty','Nenhum arquivo preparado ainda.'));
  for(const path of changedFiles()){
   const content=current.files[path],before=current.baseline?.[path];const d=el('details');const header=el('summary');const check=el('input');check.type='checkbox';check.checked=selectedFiles().has(path);check.setAttribute('aria-label','Incluir '+path);check.onclick=e=>e.stopPropagation();check.onchange=()=>{if(check.checked)selectedFiles().add(path);else selectedFiles().delete(path);};header.append(check,document.createTextNode(path+' · '+(content===undefined?'excluir':before===undefined?'novo arquivo':'alterado')));d.append(header);
   const pre=el('pre');if(before!==undefined)for(const line of before.split('\n'))pre.append(el('div','diff-remove','- '+line));if(content!==undefined)for(const line of content.split('\n'))pre.append(el('div','diff-add','+ '+line));d.append(pre);root.append(d);
  }
  if(current.review){root.append(el('h3','',current.review.approved?'Revisão aprovada':'Achados da revisão'));root.append(el('p','',current.review.summary));for(const item of current.review.findings)root.append(el('p','',item));}
  const a=el('a','download','↓ Exportar artefatos e evidências (JSON)');a.href='/api/runs/'+current.id+'/files';a.download='artifacts.json';root.append(a);
 }
 if(tab==='tests'){
  if(!current.test)root.append(el('div','empty',current.error||'Testes ainda não executados. Aprove os arquivos para iniciar.'));
  else{root.append(el('p','',current.test.kind==='report'?'✓ Estrutura do relatório verificada':current.test.code===0?'✓ Testes passaram':'✕ Testes falharam'),el('pre','',(current.test.command||'Verificação de artefatos')+'\n\n'+current.test.output));if(current.status==='test_failed'&&(current.testRepairs||0)<2){const fix=el('button','primary','Corrigir falhas e revisar');fix.onclick=()=>action('repair');root.append(fix);}if(current.projectId&&current.backups?.length&&!current.restored){const restore=el('button','danger','Restaurar último backup');restore.onclick=()=>action('restore');root.append(restore);}if(current.status==='completed'&&current.projectId){const commit=el('button','primary','Criar commit / push');commit.onclick=()=>studio.openCommit();root.append(commit);if(current.commit)root.append(el('p','',current.commit.sha+(current.commit.pushed?' · enviado ao origin':' · commit local')));}}
 }
 if(tab==='sources'){
  for(const source of current.sources||[]){const item=el('article','source-card');let link;try{const url=new URL(source.url);if(['http:','https:'].includes(url.protocol)){link=el('a','',source.title||source.url);link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';}}catch{}if(link)item.append(link);item.append(el('p','',source.excerpt||source.query||''));root.append(item);}
  if(!current.sources?.length)root.append(el('p','empty','Nenhuma fonte externa consultada nesta execução.'));
  for(const [index,suggestion] of (current.memorySuggestions||[]).entries()){const item=el('article','task');item.append(el('p','',suggestion.note));if(current.projectId&&!suggestion.approved){const approve=el('button','primary','Aprovar nota na memória');approve.onclick=()=>action('memory',{index});item.append(approve);}else if(suggestion.approved)item.append(el('small','','Nota aprovada.'));root.append(item);}
 }
}
function render(){
 renderAgents();renderDashboard(previewRun||current,agents,selectedAgent,selectAgent);renderStage(previewRun||current,agents);renderHistory();renderApproval();renderContent();
 $('#show-execution').hidden=!previewRun;$('#status').textContent=previewRun?'Prévia didática':current?(labels[current.status]||current.status):'Pronto para começar';
 $('#caption').textContent=previewRun?'Prévia do caso selecionado · sem chamadas a modelos ou execução':current?(current.mode==='demo'?'Demonstração fixa · ':'IA conectada · ')+(labels[current.status]||current.status):'Uma equipe pronta para transformar seu próximo pedido em algo real.';
 if(current?.error)notify(current.error);studio?.onRun(current);
 $('#submit').disabled=!online||runs.some(r=>['planning','executing','awaiting_command','reviewing','testing'].includes(r.status));
}
async function refresh(){for(const r of await api('/api/runs'))ingest(r);runs.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));if(current)current=runs.find(r=>r.id===current.id)||current;else current=runs[0]||null;render();}
$('#request').onsubmit=async e=>{
 e.preventDefault();notify('');$('#submit').disabled=true;
 try{if($('#exercise-case').value&&$('#mode').value==='demo')throw new Error('Os casos são exemplos de planejamento. Configure IA conectada para executar; o demo health não executa estes casos.');const created=await api('/api/runs',{method:'POST',body:JSON.stringify({mode:$('#mode').value,prompt:$('#prompt').value,...studio.options()})});previewRun=null;current=ingest(created);current=ingest(await api('/api/runs/'+created.id));tab='activity';document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('selected',b.dataset.tab===tab));render();}catch(e){notify(e);$('#submit').disabled=false;}
};
$('#show-execution').onclick=()=>{previewRun=null;render();};
$('#example').onclick=()=>{previewRun=null;$('#exercise-case').value='';$('#case-preview').replaceChildren();$('#prompt').value='Crie um módulo health que retorne status ok, com documentação e teste.';render();};
$('#mode').onchange=()=>$('#mode-note').textContent=$('#mode').value==='demo'?'Sem LLM: gera o exemplo health e executa um teste real. Seu pedido não altera o cenário.':'Pedido livre enviado ao provedor configurado. Os arquivos serão revisados e os testes gerados exigem Docker.';
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(t=>t.classList.toggle('selected',t===b));renderContent();});
$('#motion').onclick=()=>{const paused=document.body.classList.toggle('motion-paused');$('#motion').textContent=paused?'Ativar animações':'Pausar animações';$('#motion').setAttribute('aria-pressed',String(paused));};
$('#refresh').onclick=()=>refresh().catch(notify);
$('#new-task').onclick=()=>{current=null;selectedAgent=agents.find(a=>a.kind==='coordinator')?.id||'maestro';notify('');render();};
const studio=setupStudio({api,notify,onConfig:config=>{agents=config.agents;$('#mode').options[1].disabled=!config.liveAvailable;render();},getRun:()=>current,runAction:action});
(async()=>{
 try{
  try{await studio.refresh();}catch(e){if(e.authenticationRequired){await studio.login();await studio.refresh();}else throw e;}
  const cases=await api('/api/cases');
  for(const c of cases){const option=el('option','',c.title);option.value=c.id;$('#exercise-case').append(option);}
  $('#exercise-case').onchange=()=>{const c=cases.find(c=>c.id===$('#exercise-case').value);const preview=$('#case-preview');preview.replaceChildren();previewRun=c?casePreview(c,agents):null;if(!c){render();return;}$('#prompt').value=c.prompt;const names={single:'Agente único',pipeline:'Esteira',supervisor:'Supervisor',hierarchical:'Hierárquica',network:'Rede'};preview.append(el('p','','Referência didática: '+names[c.architecture]),el('p','','Validação: '+c.judge),el('p','','O planejador analisa o pedido e justifica sua escolha. Nenhuma auditoria ou teste foi executado nesta prévia.'));if(!$('#mode').options[1].disabled){$('#mode').value='live';$('#mode').onchange();}render();};
  renderCaseGallery($('#case-gallery'),cases,c=>{$('#exercise-case').value=c.id;$('#exercise-case').dispatchEvent(new Event('change'));document.querySelector('.stage-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});
  const events=new EventSource('/api/events');
  events.onopen=()=>{online=true;$('#connection').textContent='Conectado';refresh().catch(notify);};
  events.onerror=()=>{online=false;$('#connection').textContent='Reconectando';$('#submit').disabled=true;};
  events.onmessage=e=>{const r=ingest(JSON.parse(e.data));if(!current||current.id===r.id)current=r;render();};
  await refresh();
 }catch(e){notify(e);}
})();
