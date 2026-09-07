# SOLUCAO.md

## a) O gargalo que escolhi

Reconhecer mais rapidamente quando um problema é do produto (falha sistêmica), não da
unidade individual. Hoje isso só aparece quando o volume já saturou. Marcela, coordenadora de Serviço ao Cliente, cita um caso de lavadora que levou 3 meses pra ser percebido e nesse
meio tempo o custo de campo "foi para um patamar que não dava mais pra
segurar". A causa raiz, pelo relato dela: existe a triagem manual do dia a dia, mas ninguém olha o acumulado — falta uma visão de conjunto sobre o levantamento geral das ocorrências.

Achei essa a escolha mais defensável entre três pedidos que o dossiê traz:

1. O pedido da diretoria (chatbot em linguagem natural sobre a base): optei por não incluí-lo. Ele resolve um problema diferente: visibilidade sob demanda pra quem pergunta, não detecção proativa de um problema que ninguém sabe que precisa perguntar. O próprio dossiê registra que a diretoria não participou do levantamento operacional, que orçamento e prioridade não estão fechados, e que não há função e capacidade somente designada pra operar isso depois da entrega. Construir a "vitrine" antes de fechar quem vai mantê-la é o tipo de escopo que a regra do desafio pede pra cortar.
2. Automatizar a triagem diária inteira do Rodrigo: entendo que melhorias de processo são extremamente relevantes e o ideal seria facilitá-lo para reduzir um problema real (3h/dia de trabalho manual), mas não é isso que a própria Marcela chama de "o que mais me preocupa" — o problema de falha sistêmica tem um grau de urgência maior. Além disso, automatizar o fluxo de triagem completo (status, SLA, fila) esbarra em coisas que o desafio explicitamente não avalia (multiusuário, fluxo de trabalho, autenticação).
3. Monitoramento do SLA de prioridade Crítica: não construí, mas é um achado real (seção d) e virou pergunta em aberto (seção e). Não é o mesmo problema que o de detecção de falha sistêmica, e misturar os dois nessa entrega ia contra "a menor fatia que já entrega valor".

## b) A solução

```
ocorrencias.csv
      │
      ▼
normaliza (data, canal, status, parceiro, modelo)   ── determinístico
      │
      ▼
marca duplicata cross-canal (id_origem + heurística) ── determinístico
      │
      ▼
resolve sintoma efetivo:
  código declarado válido?  ──sim──► usa o declarado
        │ não/vazio
        ▼
  descrição tem texto suficiente?  ──não──► SEM_DESCRICAO_SUFICIENTE
        │ sim
        ▼
  classifica via IA, restrita aos códigos       ── IA
  válidos pra aquela linha de produto
      │
      ▼
agrega por (linha, modelo) por mês, ignorando duplicatas   ── determinístico
      │
      ▼
mês atual ≥ 5 ocorrências E ≥ 2x a média dos meses           ── determinístico
anteriores?  ──sim──► gera alerta curto (<900 caracteres)
                       com exemplos reais e custo estimado
      │
      ▼
out/alertas.md  (pronto pra colar no Teams — ver seção e sobre envio automático)
```

Rodando hoje (01/09/2026) contra a base, a regra encontra 1 alerta: o
modelo de geladeira `GCB247SLUV` teve 45 ocorrências em agosto/2026 contra uma
média de 11/mês nos meses anteriores (4,1x).

## c) Onde usei regra determinística, onde usei IA, e por quê

| Parte | Abordagem | Por quê |
|---|---|---|
| Datas, canal, status, parceiro, modelo | Determinístico | São strings tortas, mas o universo de variações é pequeno e enumerável. IA aqui seria uma "caixa-preta" pra um problema que um dicionário resolve com 100% de auditabilidade. |
| Duplicata cross-canal | Determinístico (regra: mesma série + ≤1 dia + canal diferente) | Precisa ser uma regra que dá pra explicar em uma frase pra alguém da operação questionar. |
| **Código de sintoma quando vem em branco ou o texto não bate com o catálogo** | **IA** | Aqui não tem dicionário que resolva: "não gela", "compressor liga e desliga direto", "perda de refrigeração" são a mesma coisa dita de três formas, e não dá pra prever todas as formas de antemão. Isso é exatamente o tipo de entendimento de linguagem que LLM faz bem e regra de palavra-chave faz mal — e é o problema que a Marcela citou como o que mais atrapalha ela hoje. |
| Regra de "isso é um possível spike" | Determinístico (razão ≥2x + piso de 5/mês) | A decisão que vira um alerta pra Qualidade tem que ser justificável com uma conta, não com "o modelo achou estranho". Isso também facilita a próxima pessoa ajustar o limiar sem precisar entender um modelo. |
| Texto do alerta | Determinístico (template) | Não deixei a IA parafrasear o alerta final: o risco de uma alucinação aqui (inventar um número, suavizar um dado importante) é mais caro do que o ganho de um texto mais "natural". A IA participa só até virar dado estruturado; a partir daí é conta e template. |

A IA classifica texto solto em uma categoria já existente (fechada, restrita
por linha de produto). Ela nunca decide sozinha se algo vira alerta, e nunca
inventa uma categoria fora da tabela de sintomas vigente. Isso mantém a saída
auditável mesmo a entrada sendo probabilística.

Se `ANTHROPIC_API_KEY` não estiver configurada, o pipeline roda só com o código já declarado (cobertura menor) e avisa isso no terminal. Preferi essa degradação explícita a uma regra de
palavras-chave "de contenção", que ia dar uma falsa sensação de cobertura.

## d) O que encontrei na base que ninguém me contou

1. **`codigo_sintoma` vazio em 42,7% das ocorrências** (876 de 2.051) — mais grave
   do que o "vem muita coisa em branco" que a Marcela sugere.
2. **O campo, quando preenchido, às vezes contradiz o próprio texto livre.**
   A frase idêntica "erro no painel" (TV) está rotulada `ERRO_DISPLAY` em 14
   ocorrências e `TELA_ESCURA` em 1 (`OC-2026-000629`). E em
   `OC-2026-001830`, o texto ("motor liga e desliga, não gela") foi
   declarado `RUIDO_COMPRESSOR`, mas uma leitura direta aponta `NAO_GELA`
   como o sintoma principal. **Isso invalida contar sintoma por
   `codigo_sintoma` como fez até hoje** — qualquer contagem por código
   subestima o problema real e o fragmenta em categorias menores do que ele é.
3. **`status` tem 15 grafias distintas pra 5 estados reais**, e uma delas é
   `Reaberta`/`REABERTA`/`reaberta` (72 ocorrências, ~3,5% da base) — mas o
   procedimento formal (seção 6.2) diz explicitamente que **ocorrência
   fechada não é reaberta**, que deveria virar uma ocorrência nova. Ou o
   sistema permite algo que a política proíbe, ou o procedimento está
   desatualizado (ele mesmo se declara sem revisão desde 2024). Isso
   **invalida usar o procedimento como fonte de verdade do ciclo de vida**
   sem confirmar com quem opera.
4. **`sla_horas` no sistema não diferencia Crítica de Alta** — as duas
   mapeiam pra 72 horas. Isso contradiz tanto o procedimento (Crítica = 48h)
   quanto o que a Marcela diz que vale na prática (Crítica = 24h). **Ou
   seja: nenhuma das duas regras documentadas está de fato sendo aplicada
   pelo sistema hoje** — não é só um problema de triagem, é um problema de
   configuração que provavelmente atrasa o atendimento dos casos mais
   urgentes sem que ninguém perceba.
5. **Duplicidade cross-canal é maior do que o campo criado pra isso
   (`id_origem`) mostra.** Ele marca 75 casos, mas há mais 36 pares com a
   mesma série + mesmo dia (ou dia seguinte) + canal diferente, sem nenhum
   vínculo registrado. Ou seja, o problema que a Marcela descreveu ("às
   vezes vem repetido de dois canais") é maior do que a própria tentativa de
   resolvê-lo capturou — e qualquer contagem de volume sem tratar isso está
   inflada.
6. **Achei os dois padrões que a detecção deveria pegar, escondidos na
   base:**
   - `GCB247SLUV` (Geladeira): de 6-8 ocorrências/mês (mar-mai) pra 31 em
     julho e 49 em agosto (~8x), espalhado por 3 códigos de sintoma
     diferentes (`NAO_GELA`, `RUIDO_COMPRESSOR`, `TEMP_ALTA_GABINETE`) — os
     três exemplos exatos que a Marcela deu como "parecem três problemas
     pequenos, mas é o mesmo grande" — mais 41% sem código nenhum. Se
     alguém contasse por `codigo_sintoma`, cada fatia isolada pareceria
     pequena.
   - `WMF60BW` (Máquina de Lavar): pico isolado em julho (45 ocorrências
     contra média de ~10/mês), quase todo concentrado em
     `VAZAMENTO_AGUA`, que **já regrediu em agosto**. Rodando mensalmente,
     essa ferramenta teria disparado o alerta olhando os dados fechados de
     julho — ou seja, no início de agosto — bem antes de virar um caso de
     3 meses como o citado no e-mail da Marcela.
7. `custo_peca_brl` está ausente em 24% dos casos — qualquer número de
   exposição financeira que eu reporte é piso, não valor real.

## e) Perguntas que eu faria à operação

- O prazo real de Crítica é 24h (Marcela) ou 48h (procedimento)? Hoje o
  sistema não aplica nenhum dos dois: preciso saber qual documentar antes
  de qualquer coisa que dependa de SLA.
- `Reaberta` é um estado que a operação usa de propósito, mesmo o
  procedimento dizendo que não deveria existir? Se sim, vou tratá-lo como
  válido e assumir que o documento está desatualizado.
- Quando duas ocorrências são a mesma coisa reportada por dois canais
  (`id_origem` preenchido), o processo espera que as duas sigam sendo
  atualizadas em paralelo, ou uma deveria fechar automaticamente
  referenciando a outra?
- O procedimento (seção 7) diz que não existe critério objetivo pra "falha
  sistêmica" desde 2024. Meu critério (crescimento ≥2x sobre a média dos
  meses anteriores, com piso de 5 ocorrências/mês) é um palpite razoável, não
  uma regra vinda do negócio — a Qualidade concordaria com esse limiar, ou
  tem outro em mente?
- Faz sentido juntar sintomas relacionados numa "família" (ex.: tratar
  `NAO_GELA` + `RUIDO_COMPRESSOR` + `TEMP_ALTA_GABINETE` como um problema só
  de sistema de refrigeração) pra não perder sinal quando o problema real
  está fragmentado? Não fiz isso agora porque essa taxonomia não é minha
  pra definir sozinha.
- O alerta deveria sair automaticamente no Teams, ou alguém revisa antes?
  Hoje ninguém foi designado como dono da ferramenta após a entrega (nota do
  AX Center na reunião com a diretoria) — isso muda bastante o desenho de
  quem aprova o quê.

## f) Como saberíamos em 30 dias que funcionou

**Métrica:** dos alertas gerados no período, quantos a Qualidade confirma
como falha real de produto (não de unidade/instalação/uso). Meta pros
primeiros 30 dias: **pelo menos 1 alerta confirmado como verdadeiro**, com
taxa de falso-alarme abaixo de 50% — ou seja, no máximo 1 em cada 2 alertas
pode ser "isso é normal" sem que a operação perca confiança na ferramenta.

**Abandonaria a solução se**, em 30 dias: (a) mais da metade dos alertas
forem descartados pela Qualidade como ruído, ou (b) nenhum alerta antecipar
algo que a Qualidade não teria descoberto de qualquer jeito pelo processo
mensal manual — ou seja, se a ferramenta só confirma o óbvio depois que todo
mundo já sabia, ela não entrega a promessa central (avisar antes do volume
explodir).

## g) Qualidade da saída de IA

Rotulei manualmente 20 casos reais (`eval/casos_rotulados_manual.csv`), lidos
só pela descrição livre + linha de produto — sem olhar o `codigo_sintoma` já
existente na base.

**Limitação importante, dita sem rodeio:** não havia `ANTHROPIC_API_KEY`
disponível no ambiente onde fiz essa análise. Rodei a classificação
manualmente eu mesma, seguindo exatamente o prompt que `src/classify.js`
usa, em vez de via chamada de API de verdade. Isso quer dizer que a mesma
pessoa fez o rótulo "verdade" e a "predição" — um viés de autoconsistência
conhecido. **O número abaixo é otimista e não deveria ser tratado como
validado.** Antes de confiar nisso em produção, alguém que já faz esse
julgamento hoje (o Rodrigo) precisa rotular às cegas uma amostra bem maior
(sugiro n≥100) e comparar contra a saída real da API.

**Resultado:** 17 de 20 casos (85%) com confiança alta e resposta
inequívoca. 2 casos (10%) com confiança média — envolvendo uma ambiguidade
que **já existe na base entre humanos**, não só na minha simulação: a frase
idêntica "erro no painel" (TV) foi historicamente rotulada de duas formas
diferentes por quem preencheu o campo original. 1 caso (5%) foi corretamente
identificado como não-classificável (a descrição "reincidência do mesmo
problema" não contém nenhum sintoma — certo em recusar um palpite).

**Onde ela erra:** não nos casos que testei — ela hesita exatamente onde um
humano também hesitaria (descrição vaga, ou dois sintomas do catálogo
descrevendo fisicamente o mesmo evento). O que eu **não testei** e é uma
lacuna real: o quanto ela erra em texto com erro de digitação pesado ou
gíria regional, que existe na base e eu não filtrei de propósito pra essa
amostra.

**Como detectaria degradação em produção:**
1. Taxa de `NAO_CLASSIFICADO` subindo mês a mês (sinal de que o texto está
   fugindo do que o prompt cobre bem).
2. Auditoria mensal de amostra aleatória (10 casos) pelo Rodrigo comparando
   com a saída da IA.
3. Taxa de confiança média/baixa subindo — hoje essa informação existe na
   saída do classificador mas **ainda não é usada como filtro no pipeline**
   (ver "o que ficou de fora" abaixo); é o próximo passo natural antes de
   confiar cegamente na contagem de spike.

## O que ficou explicitamente de fora (além do item a)

- Filtrar por confiança da IA antes de contar pra detecção de spike (hoje
  todo resultado da IA entra na conta, inclusive os de confiança baixa).
  Cortei por tempo, mas é a próxima coisa que eu faria — está documentado
  no código (`src/pipeline.js`) como próximo passo natural.
- Agrupamento de parceiro por nome é uma heurística simples (normalização +
  similaridade de texto), não pega tudo — ex.: "MEGATEC" sozinho não junta
  com "MegaTec Reparos". Não é usado por nada crítico na detecção de spike,
  então não investi em uma biblioteca de fuzzy-matching melhor.
- Envio automático pro Teams (webhook). O pipeline gera o texto pronto em
  `out/alertas.md`; conectar isso a um envio automático é trivial, mas
  decidi não automatizar um canal de comunicação real sem antes confirmar
  quem seria o dono/aprovador desse alerta (ver seção e) — hoje, ninguém foi
  designado pra isso após a entrega.

## h) Declaração de uso de IA

Usei o Claude Code (Sonnet 5) como agente de apoio, não como autor final: pedi
que ele lesse o dossiê, explorasse a base de dados, propusesse uma
arquitetura e escrevesse uma primeira versão do código e deste documento. O
meu papel foi ler cada saída, validar contra o dossiê e os dados, questionar
o que não fechava, e corrigir o que estava errado — inclusive boa parte da
redação deste documento é minha reescrita em cima do que a IA sugeriu
primeiro.

**3 prompts mais úteis (que dei à IA):**
1. *"Explore a base ocorrencias.csv: quais campos têm mais nulos, que
   duplicatas existem, e existe algum modelo com crescimento anômalo de
   ocorrências mês a mês?"* — foi esse prompt que revelou os casos
   `GCB247SLUV` e `WMF60BW`, que viraram a evidência central da seção (d).
2. *"Dado esse dossiê (e-mail da coordenadora + procedimento formal + pedido
   da diretoria), qual desses pontos de vista é o gargalo real, e por que os
   outros dois pedidos existem por um motivo que não é o problema em si?"* —
   foi o que sugeriu cortar o chatbot da entrega em vez de tentar agradar os
   três.
3. O próprio prompt de classificação em `src/classify.js` — *"escolha o
   código só entre os permitidos pra essa linha de produto, ou diga que não
   dá pra classificar"* — restringir o vocabulário da IA em vez de deixá-la
   livre foi a decisão que manteve a saída auditável.

**2 momentos em que a IA errou e eu corrigi:**
1. Na primeira tentativa de montar a amostra de 20 casos rotulados, a IA
   sugeriu reaproveitar os mesmos rótulos que ela mesma tinha derivado como
   "verdade" e como "predição", sem nenhuma ressalva — isso teria inflado a
   acurácia sem qualquer valor de evidência real. Eu percebi o problema,
   pedi pra expandir a amostra com casos propositalmente difíceis
   (ambiguidade que já existe na própria base), e reescrevi a seção pra
   deixar essa limitação de autoconsistência explícita, em vez de escondida
   atrás de um número bonito.
2. Na primeira leitura do pedido da diretoria, a IA esboçou uma arquitetura
   com duas frentes (chatbot + alerta), tentando não descartar nenhum dos
   três pedidos do dossiê. Eu reli a regra do desafio ("se você está
   construindo a quarta tela, já errou o exercício") e a nota do próprio AX
   Center sobre o pedido da diretoria (sem orçamento, sem dono, sem
   alinhamento operacional), e decidi cortar o chatbot inteiramente da
   entrega, deixando-o só como pergunta em aberto.
