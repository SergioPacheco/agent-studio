import {ARCHITECTURE_NAMES} from './stage-model.js';
export const CASE_REASONS={
 'case-1':'Etapas definidas e dependentes: classificar, buscar, redigir e validar antes do envio.',
 'case-2':'Os 20 repositórios permitem análises independentes; o supervisor reúne evidências e prioridades num relatório único.',
 'case-3':'Frentes grandes de back-end, front-end e dados exigem coordenação por domínio e integração entre entregas.',
 'case-4':'Objetivos, conteúdo, atividades e avaliação são produzidos em sequência, com alinhamento entre as etapas.',
 'case-5':'Alternativas de armazenamento precisam ser confrontadas por critérios; um árbitro decide e registra as divergências.',
 'case-6':'Uma alteração delimitada, com texto aprovado e teste existente, pode ser feita por um único executor.'
};
export function caseDiagram(id,type){
 const n=(label,x,y,role='worker')=>({label,x,y,role});
 if(type==='pipeline')return {nodes:(id==='case-4'?['Objetivos','Conteúdo','Atividades','Avaliação']:['Classificar','Buscar','Redigir','Validar']).map((s,i)=>n(s,180,28+i*49,i===3?'judge':'worker')),edges:[[0,1],[1,2],[2,3]]};
 if(type==='supervisor')return {nodes:[n('Supervisor',180,28,'lead'),n('Lote A',62,100),n('Lote B',180,100),n('Lote C',298,100),n('Relatório único',180,177,'judge')],edges:[[0,1],[0,2],[0,3],[1,4],[2,4],[3,4]]};
 if(type==='hierarchical')return {nodes:[n('Coordenação',180,25,'lead'),n('Líder back',62,90,'lead'),n('Líder front',180,90,'lead'),n('Líder dados',298,90,'lead'),n('API / testes',62,163),n('Telas / testes',180,163),n('Esquema / migração',298,163)],edges:[[0,1],[0,2],[0,3],[1,4],[2,5],[3,6]]};
 if(type==='network')return {nodes:[n('Custo',180,28),n('Desempenho',66,110),n('Integridade',294,110),n('Árbitro',180,185,'judge')],edges:[[0,1],[1,0],[0,2],[2,0],[1,2],[2,1],[1,3],[2,3]]};
 return {nodes:[n('Executor único',180,65),n('Teste existente',180,155,'judge')],edges:[[0,1]]};
}
const NS='http://www.w3.org/2000/svg';
function svgNode(tag,attrs,text){const n=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs||{}))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;}
function element(tag,cls,text){const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n;}
export function renderCaseGallery(root,cases,onSelect){
 root.replaceChildren();
 for(const c of cases){const card=element('article','case-card');card.dataset.case=c.id;const index=c.id.replace('case-','');card.append(element('span','case-number','CASO '+index),element('h3','',c.title.replace(/^\d+\s*·\s*/,'')),element('p','case-architecture',ARCHITECTURE_NAMES[c.architecture]));
 const d=caseDiagram(c.id,c.architecture),svg=svgNode('svg',{viewBox:'0 0 360 220',role:'img','aria-label':'Diagrama da arquitetura '+ARCHITECTURE_NAMES[c.architecture]+' para '+c.title,class:'case-diagram'});const defs=svgNode('defs'),marker=svgNode('marker',{id:c.id+'-arrow',viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:5,markerHeight:5,orient:'auto'});marker.append(svgNode('path',{d:'M0 0 10 5 0 10Z',fill:'#b79cdb'}));defs.append(marker);svg.append(defs);
 for(const [from,to] of d.edges){const a=d.nodes[from],b=d.nodes[to],dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy)||1;svg.append(svgNode('path',{d:`M${a.x+dx/len*24} ${a.y+dy/len*18} L${b.x-dx/len*25} ${b.y-dy/len*21}`,fill:'none',stroke:'#8d75ab','stroke-width':1.5,'marker-end':`url(#${c.id}-arrow)`}));}
 for(const node of d.nodes){const g=svgNode('g',{class:'case-node '+node.role});g.append(svgNode('rect',{x:node.x-54,y:node.y-15,width:108,height:30,rx:9}),svgNode('text',{x:node.x,y:node.y+4,'text-anchor':'middle'},node.label));svg.append(g);}card.append(svg,element('p','case-reason',CASE_REASONS[c.id]),element('p','case-judge','Validação: '+c.judge));const button=element('button','case-explore','Explorar caso '+index);button.type='button';button.onclick=()=>onSelect(c);card.append(button);root.append(card);}
}
