# Agent Studio ✳

Estúdio visual de agentes para o exercício **REA is back — IA e Produtividade**. Uma implementação original inspirada no Estúdio descrito por Fernando Nogueira, com ideias de especialistas persistentes do OpenDots e visualização de atividade do Pixel Agents. Não é uma cópia da implementação interna desses projetos.

## Iniciar

Requisito: **Node.js 22 ou superior**. Nenhuma dependência npm para instalar.

~~~sh
git clone https://github.com/SergioPacheco/agent-studio.git
cd agent-studio
npm start
~~~

Abra **http://127.0.0.1:5173**. O servidor escuta somente em loopback.

### Demonstração sem credenciais

1. Escolha **Demonstração • cenário fixo** e clique em **Reunir o time**.
2. Abra Plano e aprove a distribuição de tarefas.
3. Confira Arquivos & diff e a revisão demonstrativa.
4. Aprove arquivos e testes.
5. Confira a saída real de \`node --test\` e exporte as evidências.

O modo demo **não usa LLM e não interpreta pedidos livres**. Produz sempre um módulo health, documentação e um teste fixo confiável. Os eventos correspondem às etapas reais da aplicação; decisões e revisão são programadas. Não confundir com execução multiagente por IA.

### Modo real com IA

~~~sh
cp .env.example .env
~~~

Configure \`AI_API_KEY\`, \`AI_MODEL\` e, se necessário, \`AI_BASE_URL\`. O endpoint deve implementar **Chat Completions com function tools**, no formato compatível OpenAI. Credenciais permanecem no servidor. Modelos por papel podem ser definidos pelas variáveis \`AI_MODEL_MAESTRO\`, \`AI_MODEL_CHEVRON\`, \`AI_MODEL_PIXEL\`, \`AI_MODEL_SCOUT\`, \`AI_MODEL_REVISOR\`.

Reinicie o servidor. O modo IA será habilitado. As assinaturas de interfaces de chat não são automaticamente credenciais de API; custos e limites dependem do provedor escolhido.

Para executar **testes de código gerado**, instale Docker e prepare a imagem:

~~~sh
docker pull node:22-alpine
npm start
~~~

O sistema não baixa imagens durante os testes (\`--pull=never\`). Se Docker/imagem estiverem ausentes, a execução informa erro; não há fallback para executar código gerado diretamente no host.

## Equipe

| Agente | Responsabilidade | Permissões |
| --- | --- | --- |
| Maestro | Plano, distribuição e síntese de estado | Planejar; não edita arquivos |
| Chevron | Back-end e correções | Ler e preparar arquivos |
| Pixel | Interface | Ler e preparar arquivos |
| Scout | Investigar o projeto preparado | Somente ler; sem busca web |
| Revisor | Avaliar objetivo e artefatos em contexto separado | Revisar; não modifica arquivos |

No modo IA, Chevron, Pixel e Scout primeiro propõem assumir ou passar, com justificativa. Maestro recebe as propostas e seleciona tarefas e especialistas. Cada tarefa tem seu histórico separado. O executor pode escolher chamadas a ferramentas em até 8 rodadas por tarefa; resultados retornam ao modelo. O revisor recebe o objetivo e os artefatos, não o histórico do autor. Reprovações geram até duas rodadas de correção; após isso, o processo para.

O controlador executa as tarefas **sequencialmente**, respeitando dependências. Não há promessa de paralelismo. O plano tem até oito tarefas. Todos podem usar o mesmo modelo ou modelos diferentes no mesmo endpoint.

## Fluxo e critérios de aceite

- Pedido único pelo painel, com modo explicitamente identificado.
- Plano estruturado e aprovação humana antes de executar.
- Estados e eventos transmitidos por SSE.
- Chamadas reais de ferramentas no modo IA.
- Revisão independente do contexto do executor.
- Arquivos preparados e diff antes da aprovação final.
- Testes executados pelo sistema após a última edição aprovada.
- Histórico persistente, cancelamento e exportação JSON.
- Erros de provedor e testes ficam visíveis; nenhuma resposta falsa de sucesso.
- Layout responsivo e respeito a preferência por movimento reduzido.

Estados: planejamento → aguardando plano → execução → revisão → aguardando arquivos → testes → conclusão/falha. Reiniciar durante execução marca o trabalho como interrompido; inicie outro pedido. Nenhuma retomada automática de efeitos incertos.

## Workspace, testes e limites

Artefatos são novos projetos independentes salvos em \`.studio/artifacts/<id>\`. O sistema **não edita pastas arbitrárias nem importa seu repositório existente**. Como a origem é vazia, o diff apresenta novos arquivos. Não há ferramenta shell para o modelo. Até 30 arquivos, 100 KB por arquivo, 500 KB no conjunto. Extensões aceitas: mjs, js, json, html, css, md, txt.

Testes gerados precisam ser arquivos \`*.test.mjs\` na raiz, sem dependências externas. Docker executa Node sem rede, sem privilégios, com filesystem somente leitura, limites de CPU/memória/PIDs e timeout. A pasta de artefatos é montada somente para leitura. Isso reduz exposição; containers compartilham o kernel do host e não equivalem a uma VM.

No demo apenas o fixture fixo conferido por hash é executado diretamente no host. Testes aprovados não provam ausência de bugs. O revisor não afirma ter executado testes.

O app é local, de usuário único, sem autenticação. Não o exponha por proxy público. Valida Host e Origin, renderiza texto sem HTML de modelos e limita tipos/tamanho/caminhos. Pedidos e artefatos do modo IA são enviados ao endpoint configurado. \`.env\` e \`.studio\` não entram no Git. Não grave segredos nas tarefas.

**Fora do escopo:** múltiplos endpoints/provedores simultâneos, voz, Slack, navegador remoto, MCP, mascotes modelados em 3D, edição colaborativa, retry automático após falha de testes e execução paralela. Os mascotes são CSS com volume visual. As conclusões sobre capacidades dos agentes não dependem das animações.

## Verificação

~~~sh
npm run check
npm test
~~~

GitHub Actions verifica sintaxe e executa testes de regras, ferramentas, revisão e ciclo HTTP completo com testes reais do fixture, persistência e bloqueio de origem externa. O CI também testa o protocolo de IA com um provedor HTTP simulado e execução real em Docker. Testes automatizados não chamam provedores pagos. **A integração live precisa de validação com suas credenciais; não é declarada verificada só pelo CI.**

## Apresentação em 3 minutos

- 0:00 — explique que um pedido mobiliza especialistas e mostre o modo escolhido.
- 0:30 — envie o pedido e aprove o plano.
- 1:00 — acompanhe atividade e os arquivos produzidos.
- 1:45 — confira revisão e aprove os artefatos.
- 2:15 — mostre comando e saída dos testes.
- 2:45 — explique memória persistente, contextos separados e limites.

## Arquitetura

Frontend HTML/CSS/JS → servidor Node HTTP/SSE → orquestrador → endpoint de modelo.
Ferramentas atuam em mapa de arquivos preparado; exportação aprovada cria workspace por execução.
Históricos e eventos ficam em JSON, persistidos por escrita temporária e rename.
Docker executa testes gerados após aprovação.

Referências conceituais:
- [Post do Estúdio](https://www.linkedin.com/feed/update/urn:li:activity:7521330422434246656/)
- [OpenDots](https://github.com/CopilotKit/OpenDots)
- [Pixel Agents](https://github.com/pixel-agents-hq/pixel-agents)

Código original, sem reutilização de código ou assets desses repositórios.

## Licença

MIT. Veja LICENSE.
