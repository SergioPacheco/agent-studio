export const ARCHITECTURE_NAMES={single:'Agente único',pipeline:'Esteira',supervisor:'Supervisor',hierarchical:'Hierárquica',network:'Rede'};
const running=new Set(['planning','executing','reviewing','testing']);
export function agentActivity(run,agent){
 const tasks=run?.plan?.tasks||[],own=tasks.filter(t=>t.agent===agent.id),active=own.find(t=>t.status==='working');
 const failed=new Set(tasks.filter(t=>t.status==='error').map(t=>t.id));let changed=true;while(changed){changed=false;for(const t of tasks)if(!failed.has(t.id)&&(t.dependsOn||[]).some(id=>failed.has(id))){failed.add(t.id);changed=true;}}
 const state=run?.agents?.[agent.id]||'idle';
 if(run?.preview)return {state:'idle',label:'Prévia',task:own[0]};
 if(state==='error')return {state:'error',label:'Falhou',task:active||own.find(t=>t.status==='error')};
 if(own.some(t=>t.status==='error'))return {state:'error',label:'Falhou',task:own.find(t=>t.status==='error')};
 if(own.some(t=>failed.has(t.id)))return {state:'blocked',label:'Bloqueado',task:own.find(t=>failed.has(t.id))};
 if(run?.status==='planning'&&state==='working')return {state:'planning',label:'Planejando'};
 if(run?.status==='reviewing'&&agent.kind==='reviewer')return {state:'reviewing',label:'Revisando'};
 if(run?.status==='testing'&&agent.kind==='coordinator')return {state:'checking',label:run.outputKind==='report'?'Verificando relatório':'Verificando testes'};
 if(run?.status==='awaiting_command'&&run.pendingActions?.some(a=>a.agent===agent.id&&a.status==='pending'))return {state:'waiting',label:'Aguardando aprovação',task:active};
 if(run?.status==='executing'&&active)return {state:active.validation?'checking':'working',label:active.validation?'Validando':'Executando',task:active};
 if(run?.status==='awaiting_plan'&&agent.kind==='coordinator')return {state:'waiting',label:'Aguardando aprovação'};
 if(['cancelled','interrupted'].includes(run?.status))return {state:'idle',label:run.status==='cancelled'?'Cancelado':'Interrompido'};
 if(own.length&&own.every(t=>t.status==='done'))return {state:'done',label:'Concluído',task:own.at(-1)};
 if(own.length)return {state:'waiting',label:'Aguardando dependências',task:own.find(t=>t.status!=='done')};
 if(running.has(run?.status)&&state==='working')return {state:'working',label:'Em atividade'};
 return {state:state==='done'?'done':'idle',label:state==='done'?'Concluído':'Disponível'};
}
export function stageModel(run,agents){
 const type=Object.hasOwn(ARCHITECTURE_NAMES,run?.architecture?.type)?run.architecture.type:'supervisor',tasks=run?.plan?.tasks||[];
 const ids=new Set(tasks.map(t=>t.agent)),lead=agents.find(a=>a.kind==='coordinator')||agents[0],reviewer=agents.find(a=>a.kind==='reviewer');
 const participants=[...ids].map(id=>agents.find(a=>a.id===id)).filter(Boolean),main=tasks.length?participants:agents;
 const nodes=agents.map(a=>({...a,...agentActivity(run,a),support:tasks.length?!ids.has(a.id)&&!(a.id===lead?.id&&['supervisor','hierarchical'].includes(type)):false,x:500,y:35}));
 const place=(id,x,y)=>{const n=nodes.find(n=>n.id===id);if(n){n.x=x;n.y=y;}};
 const row=(list,y)=>list.forEach((a,i)=>place(a.id,100+(i+.5)*800/Math.max(1,list.length),y));
 let height=540,groups=[];
 if(type==='single'){row(main.slice(0,1),60);height=330;}
 else if(type==='pipeline'){main.forEach((a,i)=>place(a.id,160+(i%3)*340,40+Math.floor(i/3)*240));height=90+Math.ceil(main.length/3)*240;}
 else if(type==='network'){const cx=500,cy=210,rx=310,ry=150;if(main.length<=4){main.forEach((a,i)=>{const theta=-Math.PI/2+i*2*Math.PI/Math.max(1,main.length);place(a.id,cx+Math.cos(theta)*rx,cy+Math.sin(theta)*ry);});height=600;}else{for(let i=0;i<main.length;i+=3)row(main.slice(i,i+3),40+Math.floor(i/3)*240);height=90+Math.ceil(main.length/3)*240;}}
 else if(type==='hierarchical'){
  place(lead?.id,500,15);const domains=[...new Set(tasks.map(t=>t.domain).filter(d=>d&&d!=='integration'))];
  const assigned=new Set([lead?.id]);for(const [i,domain] of domains.entries()){const x=100+(i+.5)*800/Math.max(1,domains.length);groups.push({label:domain,x,y:245});const members=participants.filter(a=>!assigned.has(a.id)&&tasks.some(t=>t.agent===a.id&&t.domain===domain));for(const [j,a] of members.entries()){place(a.id,x,290+j*220);assigned.add(a.id);}}
  const remaining=main.filter(a=>!assigned.has(a.id));const nextRow=Math.max(290,...nodes.filter(n=>assigned.has(n.id)).map(n=>n.y+240));for(let i=0;i<remaining.length;i+=3)row(remaining.slice(i,i+3),nextRow+Math.floor(i/3)*240);height=Math.max(570,...nodes.map(n=>n.y+240));
 }else{place(lead?.id,500,15);const others=main.filter(a=>a.id!==lead?.id);for(let i=0;i<others.length;i+=4)row(others.slice(i,i+4),270+Math.floor(i/4)*240);height=others.length?300+Math.ceil(others.length/4)*240:300;}
 // Coordinator and reviewer are real support roles, never invented subagents.
 if(tasks.length){const support=nodes.filter(n=>n.support);for(let i=0;i<support.length;i+=4)row(support.slice(i,i+4),height+20+Math.floor(i/4)*230);if(support.length){groups.push({label:'Apoio · coordenação e revisão independentes',x:500,y:height});height+=Math.ceil(support.length/4)*230+25;}}
 
 const links=[];const add=(from,to,label,live,kind,task)=>{if(!nodes.some(n=>n.id===from)||!nodes.some(n=>n.id===to))return;const key=from+'>'+to+':'+kind;const old=links.find(l=>l.key===key);if(old){if(live){old.label=String(label||'Entrega').slice(0,45);old.task=task;}old.live||=!!live&&!run?.preview&&running.has(run?.status);return;}links.push({key,from,to,label:String(label||'Entrega').slice(0,45),live:!!live&&!run?.preview&&running.has(run?.status),kind,task});};
 for(const t of tasks)for(const dep of t.dependsOn||[]){const prev=tasks.find(p=>p.id===dep);if(prev)add(prev.agent,t.agent,prev.contract?.delivery||prev.title,run?.status==='executing'&&prev.status==='done'&&t.status==='working','dependency',t.id);}
 if(run&&tasks.length&&['supervisor','hierarchical'].includes(type)&&lead)for(const a of participants)if(a.id!==lead.id)add(lead.id,a.id,'Distribuição',false,'assignment');
 if(reviewer&&tasks.length){const leaves=tasks.filter(t=>!tasks.some(other=>(other.dependsOn||[]).includes(t.id)));for(const t of leaves)if(t.agent!==reviewer.id)add(t.agent,reviewer.id,'Revisão independente',run?.status==='reviewing','review');}
 return {type,label:run?.architecture?.label||ARCHITECTURE_NAMES[type],preview:!!run?.preview,nodes,links,groups,height:Math.max(400,height),rationale:run?.architecture?.rationale||(!run?'O palco se organiza quando houver um plano.':'Organização padrão do fluxo existente.'),judge:run?.architecture?.judge||'Revisão e verificação antes da entrega.'};
}
export function casePreview(c,agents){
 const workers=agents.filter(a=>a.kind==='worker');if(!workers.length)return null;
 const worker=i=>workers[i%workers.length].id,task=(id,i,dependsOn=[],extra={})=>({id,agent:worker(i),title:id.replaceAll('-',' '),dependsOn,contract:{delivery:id.replaceAll('-',' '),format:'Artefato',trigger:'Conclusão das dependências',validation:'Critério do caso'},...extra});
 let tasks=[];
 if(c.architecture==='single')tasks=[task('corrigir-mensagem',0)];
 if(c.architecture==='pipeline')tasks=(c.id==='case-4'?['objetivos','conteudo','atividades','avaliacao']:['classificar','buscar','redigir','validar']).map((id,i,all)=>task(id,i,i?[all[i-1]]:[],{validation:true}));
 if(c.architecture==='supervisor')tasks=[task('auditoria-lote-a',0),task('auditoria-lote-b',1),task('auditoria-lote-c',2),task('relatorio-consolidado',0,['auditoria-lote-a','auditoria-lote-b','auditoria-lote-c'],{consolidation:true})];
 if(c.architecture==='hierarchical'){for(const [i,domain] of ['back','front','dados'].entries())tasks.push(task(domain,i,[],{domain}),task(domain+'-validacao',i,[domain],{domain,validation:true}));tasks.push(task('integracao',0,['back-validacao','front-validacao','dados-validacao'],{domain:'integration'}));}
 if(c.architecture==='network')tasks=[...workers.map((a,i)=>task('proposta-'+i,i,[],{round:1})),...workers.map((a,i)=>task('critica-'+i,i,workers.map((_,j)=>'proposta-'+j),{round:2}))];
 return {preview:true,status:'preview',architecture:{type:c.architecture,rationale:'Exemplo didático editável. A escolha real será feita pelo planejador a partir do pedido.',judge:c.judge},plan:{tasks},agents:{},events:[],files:{},usage:{calls:0,tokens:0}};
}
