import {randomUUID} from 'node:crypto';
export class Conversations{
 constructor({store,router,catalog}){this.store=store;this.router=router;this.catalog=catalog;this.items=new Map();this.busy=new Set();this.controllers=new Map();}
 async init(){for(const name of await this.store.list('conversations')){const c=await this.store.read(name,null);if(c)this.items.set(c.id,c);}}
 list(){return [...this.items.values()].map(({messages,...c})=>({...c,messageCount:messages.length})).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
 async create({projectId=null,agentId='maestro',title='Nova conversa'}){
  if(!this.catalog.agents.some(a=>a.id===agentId)||projectId&&!this.catalog.projects.some(p=>p.id===projectId))throw new Error('Agente ou projeto não encontrado.');
  const now=new Date().toISOString(),c={id:randomUUID(),projectId,agentId,title:String(title).slice(0,100),createdAt:now,updatedAt:now,messages:[]};this.items.set(c.id,c);await this.save(c);return c;
 }
 save(c){c.updatedAt=new Date().toISOString();return this.store.write('conversations/'+c.id,c);}
 async append(id,role,content,extra={}){const c=this.items.get(id);if(!c)throw new Error('Conversa ausente.');c.messages.push({role,content:String(content).slice(0,30000),time:new Date().toISOString(),...extra});await this.save(c);return c;}
 cancelAll(){for(const controller of this.controllers.values())controller.abort();}
 async respond(id,text){
  const c=this.items.get(id);if(!c)throw new Error('Conversa ausente.');if(this.busy.has(id))throw new Error('Aguarde a resposta anterior.');if(typeof text!=='string'||!text.trim()||text.length>4000)throw new Error('Mensagem inválida.');this.busy.add(id);const controller=new AbortController();this.controllers.set(id,controller);
  try{
   await this.append(id,'user',text);const a=this.catalog.agents.find(a=>a.id===c.agentId);if(!a)throw new Error('Agente removido.');const project=this.catalog.projects.find(p=>p.id===c.projectId);
   const context=c.messages.slice(-30).map(({role,content})=>({role,content}));while(JSON.stringify(context).length>100000&&context.length>1)context.shift();
   const result=await this.router.call({agent:a.id,signal:controller.signal,messages:[{role:'system',content:'You are '+a.name+', '+a.role+'. '+a.instructions+'\nPersonality: '+a.personality+'\nApproved project memory: '+(project?.memory||'')+'\nThis is a conversation, without tools. Do not claim to have edited files or executed commands. To implement changes, ask the user to send a task to the team.'},...context]});
   if(!result.content)throw new Error('Modelo retornou uma resposta vazia.');await this.append(id,'assistant',result.content,{agent:a.id});return c;
  }catch(e){await this.append(id,'assistant','Não foi possível obter a resposta: '+e.message,{error:true});throw e;}finally{this.busy.delete(id);this.controllers.delete(id);}
 }
}
