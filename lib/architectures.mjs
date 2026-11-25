export const ARCHITECTURES={single:'Agente único',pipeline:'Esteira',supervisor:'Supervisor',hierarchical:'Hierárquica',network:'Rede'};
export const CASES=[
 {id:'case-1',title:'1 · Triagem de chamados',architecture:'pipeline',prompt:'Triar chamados de TI: classificar categoria e urgência, buscar na base de soluções, redigir resposta e validar antes do envio. Cada etapa usa a anterior. Sem evidência suficiente, encaminhar ao humano.',judge:'Portão antes do envio: evidência aplicável e resposta sustentada; humano quando necessário.'},
 {id:'case-2',title:'2 · Auditoria de 20 repositórios',architecture:'supervisor',prompt:'Auditar a segurança de 20 repositórios em linguagens diferentes. Cada repositório pode ser analisado independentemente. Consolidar relatório único com prioridades, evidências, limitações e recomendações. Solicitar caminhos ou snapshots antes de afirmar achados reais.',judge:'Supervisor confere evidências dos especialistas e consolida prioridades.'},
 {id:'case-3',title:'3 · Aplicativo de reserva de salas',architecture:'hierarchical',prompt:'Criar aplicativo de reserva de salas do zero: back-end, front-end e banco de dados. São frentes grandes, com decisões próprias e muitos arquivos. Prazo de um mês, entregas incrementais. Definir contratos entre frentes e validar conflitos de reserva.',judge:'Responsáveis validam cada frente; coordenação geral valida contratos e integração.'},
 {id:'case-4',title:'4 · Plano de aula',architecture:'pipeline',prompt:'Produzir plano de aula a partir da ementa: objetivos, conteúdo, atividades e avaliação, nessa ordem. Cada etapa utiliza a anterior. Solicitar a ementa se ausente. Conferir se cada objetivo possui atividade e avaliação alinhadas.',judge:'Portões de coerência entre etapas e conferência pedagógica final.'},
 {id:'case-5',title:'5 · Escolha do armazenamento',architecture:'network',prompt:'Comparar banco relacional, documentos e planilha integrada para um sistema de matrícula. Debater custo, desempenho, integridade e facilidade. Levantar requisitos antes da recomendação. Propostas independentes, crítica cruzada e síntese, até três rodadas; registrar divergências.',judge:'Árbitro fora do debate decide pelos requisitos, evidências e prioridades.'},
 {id:'case-6',title:'6 · Corrigir mensagem de erro',architecture:'single',prompt:'Corrigir uma mensagem de erro em uma linha de um único arquivo. O novo texto já está aprovado e o teste existente cobre a mensagem. Solicitar arquivo e texto aprovado se ausentes. Fazer apenas a alteração delimitada e executar o teste existente.',judge:'Diff limitado à mensagem aprovada e teste existente; aprovação humana.'}
];
export function validateArchitecture(a){
 if(!a||!Object.hasOwn(ARCHITECTURES,a.type)||typeof a.rationale!=='string'||!a.rationale.trim()||typeof a.judge!=='string'||!a.judge.trim())throw new Error('Arquitetura exige tipo, justificativa e juiz.');
 if(a.type==='network'&&(!Number.isInteger(a.rounds)||a.rounds<1||a.rounds>3))throw new Error('Rede exige de 1 a 3 rodadas.');
 return {type:a.type,label:ARCHITECTURES[a.type],rationale:a.rationale.slice(0,1500),judge:a.judge.slice(0,1000),rounds:a.type==='network'?a.rounds:1};
}
export function constrainTasks(tasks,a){
 const result=tasks.map(t=>({...t,dependsOn:[...t.dependsOn]}));
 if(a.type==='single'&&new Set(tasks.map(t=>t.agent)).size!==1)throw new Error('Agente único exige um executor.');
 if(a.type==='pipeline')for(let i=1;i<result.length;i++)result[i].dependsOn=[...new Set([...result[i].dependsOn,result[i-1].id])];
 if(a.type==='hierarchical'&&tasks.some(t=>typeof t.domain!=='string'||!t.domain.trim()))throw new Error('Hierarquia exige domínio em cada tarefa.');
 if(a.type==='supervisor'&&!result.some(t=>t.consolidation===true&&result.filter(p=>p.id!==t.id).length>0&&result.filter(p=>p.id!==t.id).every(p=>t.dependsOn.includes(p.id))))throw new Error('Supervisor exige consolidação após todas as análises.');
 if(a.type==='hierarchical'){
  const domains=[...new Set(result.filter(t=>t.domain!=='integration').map(t=>t.domain))];
  if(!domains.length)throw new Error('Hierarquia exige frentes de trabalho.');
  for(const domain of domains){const members=result.filter(t=>t.domain===domain);if(members.length<2)throw new Error('Domínio exige execução e validação.');if(!members.some(t=>t.validation===true&&members.filter(p=>p.id!==t.id).every(p=>t.dependsOn.includes(p.id))))throw new Error('Cada domínio exige tarefa de validação após seus executores.');}
  const gates=result.filter(t=>t.validation===true&&t.domain!=='integration');
  if(!result.some(t=>t.domain==='integration'&&gates.every(g=>t.dependsOn.includes(g.id))))throw new Error('Hierarquia exige integração após validações de domínio.');
 }
 if(a.type==='network'){
  if(new Set(result.map(t=>t.agent)).size<2)throw new Error('Rede exige pelo menos dois participantes.');
  for(const t of result){if(!Number.isInteger(t.round)||t.round<1||t.round>a.rounds)throw new Error('Rodada inválida.');const prior=result.filter(p=>p.round===t.round-1);if(t.round>1&&!prior.length)throw new Error('Rodada anterior ausente.');t.dependsOn=[...new Set([...t.dependsOn,...prior.map(p=>p.id)])];}
  if(!result.some(t=>t.round===a.rounds))throw new Error('Rodada final ausente.');
 }
 return result;
}
export const PLANNING_GUIDANCE=`Select architecture from task properties, not keywords or case number. Return architecture:{type:single|pipeline|supervisor|hierarchical|network,rationale,judge,rounds}. Prefer single for bounded changes; pipeline for ordered dependent stages; supervisor for independent analyses and final synthesis; hierarchical for large domains with domain coordination; network for proposals, cross critique and synthesis (1-3 rounds). Mixed needs use the primary architecture and explicit task dependencies. Every task must include contract:{delivery,format,trigger,validation}, domain for hierarchical, round for network. Hierarchical plans must include a validation:true task per domain depending on ALL tasks in that domain, followed by a domain:integration task depending on ALL domain validation tasks; network round N reads ALL outputs of round N-1, with synthesis by the external reviewer. Missing inputs must be requested, never invented. For analysis-only tasks produce report artifacts, not fictional code or test results. Single uses one worker across tasks. All connections and validation must be explicit. Pipeline tasks must set validation:true and return a gate verdict after checking their contract. Supervisor must include a consolidation:true task depending on ALL analyses. OutputKind must be code or report; report mode may only create/change nonempty md/txt/json report artifacts, never code. Domain validation tasks must use validation:true. Up to 32 tasks. Do not increase existing permissions.`;
export function validateContracts(tasks){
 for(const t of tasks)for(const field of ['delivery','format','trigger','validation'])if(typeof t.contract?.[field]!=='string'||!t.contract[field].trim()||t.contract[field].length>2000)throw new Error('Contrato inválido: '+t.id+' / '+field);
}
export function validateGate(text){
 let result;try{result=JSON.parse(text);}catch{throw new Error('Portão exige veredito JSON.');}
 if(!result||!['pass','blocked'].includes(result.status)||typeof result.summary!=='string'||!result.summary.trim())throw new Error('Veredito inválido.');
 if(result.status==='blocked')throw new Error('Validação bloqueada; intervenção necessária: '+result.summary);
 return result;
}
export function verifyReportArtifacts(files,baseline={}){
 const changed=[...new Set([...Object.keys(files),...Object.keys(baseline)])].filter(p=>files[p]!==baseline[p]);
 if(!changed.length||changed.some(p=>!(/\.(md|txt|json)$/.test(p))||typeof files[p]!=='string'||!files[p].trim()))throw new Error('Relatório exige artefatos não vazios e não pode alterar código.');
 for(const p of changed)if(p.endsWith('.json')){if(!p.startsWith('reports/'))throw new Error('Relatórios JSON devem ficar em reports/, sem alterar manifests.');JSON.parse(files[p]);}
 return {code:0,kind:'report',output:'Artefatos de relatório verificados: '+changed.join(', ')+'. Verificação estrutural; não comprova veracidade dos achados nem executa testes de código.'};
}
