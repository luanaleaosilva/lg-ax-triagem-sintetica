# SOLUÇÃO

## a) O gargalo que escolhi

O problema que escolhi atacar foi **reconhecer mais rapidamente quando um problema é do produto, ou seja, uma falha sistêmica, e não de uma unidade individual**.

Hoje, isso parece ficar evidente apenas quando o volume de ocorrências já está muito alto. Marcela, coordenadora de Serviço ao Cliente, cita o caso de uma lavadora que levou três meses para ser percebido. Nesse período, o custo de campo “foi para um patamar que não dava mais pra segurar”.

Pelo relato dela, a causa está principalmente na falta de uma visão do todo. Existe uma triagem e um trabalho manual no dia a dia, mas não existe uma forma de relacionar as ocorrências e perceber que vários casos aparentemente isolados podem estar apontando para o mesmo problema.

### Por que escolhi esse problema?

Achei essa a escolha mais defensável entre os três pedidos que aparecem no dossiê.

**1. Chatbot em linguagem natural sobre a base**

Optei por não incluir esse pedido. Ele pode ser útil, mas resolve um problema diferente. O chatbot daria visibilidade sob demanda para quem já sabe o que quer perguntar. A solução que estou propondo tenta identificar um problema antes mesmo de alguém saber que precisa fazer essa pergunta.

Além disso, o próprio dossiê registra que a diretoria não participou do levantamento operacional, que orçamento e prioridade ainda não estão fechados e que não existe uma função claramente definida para operar a solução depois da entrega.

Por isso, entendi que construir essa “vitrine” agora aumentaria o escopo sem necessariamente atacar o principal problema encontrado.

**2. Automatizar toda a triagem diária do Rodrigo**

Acho que reduzir o trabalho manual do Rodrigo é uma oportunidade bastante relevante. São cerca de três horas por dia dedicadas à triagem, então existe um ganho claro de produtividade.

Mesmo assim, não é o problema que Marcela apresenta como “o que mais me preocupa”. Além disso, automatizar o fluxo inteiro de triagem, incluindo status, SLA e fila, levaria a solução para questões de workflow, multiusuário e autenticação, que não são o foco do desafio.

**3. Monitoramento do SLA de prioridade Crítica**

Esse também foi um achado importante da análise, mas preferi não transformá-lo no foco da entrega.

Ele é um problema real, mas diferente do problema de detectar uma possível falha sistêmica. Misturar os dois acabaria aumentando o escopo justamente quando a proposta do desafio é encontrar a menor solução que já consiga entregar valor.

---

## b) A solução

A solução que desenvolvi transforma as ocorrências individuais em um sinal de que pode existir um problema maior acontecendo.

```text
ocorrencias.csv
      |
      v
normaliza os campos
(data, canal, status, parceiro, modelo)
      |
      v
identifica duplicidades cross-canal
(id_origem + heurística)
      |
      v
resolve o sintoma efetivo
      |
      + código declarado é válido?
      |       |
      |       + sim: usa o código declarado
      |
      + não ou vazio
              |
              v
       a descrição tem informação suficiente?
              |
              + não: SEM_DESCRICAO_SUFICIENTE
              |
              + sim
                    |
                    v
             classificação por IA
             restrita aos códigos
             válidos para aquela linha
                    |
                    v
        agrega por linha + modelo + mês
        ignorando duplicidades
                    |
                    v
       mês atual >= 5 ocorrências
       E
       mês atual >= 2x a média dos meses anteriores?
                    |
              +-----+-----+
              |           |
             não         sim
              |           |
              v           v
           encerra    gera alerta curto
                      (<900 caracteres)
                      com exemplos reais
                      e custo estimado
                              |
                              v
                       out/alertas.md
                 pronto para revisão/uso
```

A ideia é separar bem onde uma regra simples resolve o problema e onde realmente vale usar IA.

Na execução realizada em 01/09/2026, a regra encontrou um alerta para o modelo de geladeira `GCB247SLUV`, que apresentou um crescimento expressivo em relação à média dos meses anteriores. **O número exato de ocorrências em agosto precisa ser confirmado na base, porque existe uma divergência entre as versões deste documento.**

Mais do que simplesmente contar ocorrências, a solução tenta primeiro organizar os dados, eliminar duplicidades e interpretar os sintomas que estão escritos de formas diferentes. Só depois disso faz a conta para verificar se existe um crescimento fora do padrão.

---

## c) Onde usei regra determinística e onde usei IA

Minha decisão foi usar IA somente onde ela realmente ajuda. Para o restante, preferi regras determinísticas, porque são mais fáceis de explicar, testar e ajustar.

| Parte                                                           | Abordagem          | Por quê                                                                                                                                                                                          |
| --------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Datas, canal, status, parceiro e modelo                         | **Determinístico** | São variações que consigo mapear. Não faria sentido usar IA para resolver algo que um dicionário consegue resolver de forma totalmente auditável.                                                |
| Duplicidade cross-canal                                         | **Determinístico** | É importante conseguir explicar a regra para a operação. Neste caso, usei mesma série + até 1 dia de diferença + canais diferentes.                                                              |
| Código de sintoma quando está vazio ou não bate com a descrição | **IA**             | Aqui existe um problema de interpretação de linguagem. “Não gela”, “compressor liga e desliga direto” e “perda de refrigeração” podem estar descrevendo o mesmo problema de maneiras diferentes. |
| Identificação de spike                                          | **Determinístico** | Não quis deixar a decisão de gerar um alerta nas mãos da IA. É uma decisão que precisa ser explicada por uma conta.                                                                              |
| Texto do alerta                                                 | **Determinístico** | Preferi um template para garantir que a IA não altere números, omita informações importantes ou invente alguma coisa.                                                                            |

A IA, portanto, entra somente na interpretação do texto livre.

Ela recebe os códigos válidos para aquela linha de produto e precisa escolher um deles ou dizer que não é possível classificar.

Ela não decide sozinha se existe uma falha sistêmica, não cria novas categorias e não decide quando um alerta deve ser gerado.

Isso deixa a parte probabilística concentrada em um ponto específico do pipeline e mantém o restante da decisão mais fácil de auditar.

Caso `ANTHROPIC_API_KEY` não esteja configurada, o pipeline funciona apenas com os códigos já declarados, mas com uma cobertura menor. O próprio terminal informa essa condição.

Preferi isso a criar uma regra de palavras-chave apenas para substituir a IA, porque isso poderia dar uma falsa sensação de cobertura. O problema aqui é justamente entender diferentes formas de descrever o mesmo sintoma.

---

## d) O que encontrei na base que não estava explícito no dossiê

A análise da base trouxe alguns problemas que ajudam a explicar por que hoje é difícil identificar esses padrões.

### 1. 42,7% das ocorrências não possuem código de sintoma

São **876 de 2.051 ocorrências**.

Isso foi mais significativo do que eu esperava a partir do relato de que “vem muita coisa em branco”.

Na prática, significa que qualquer análise feita somente pelo `codigo_sintoma` já começa deixando uma parte grande dos casos de fora.

### 2. O código de sintoma pode contradizer a própria descrição

Um dos pontos que mais me chamou atenção foi perceber que o código preenchido nem sempre corresponde ao que está escrito na descrição.

Na TV, por exemplo, a frase **“erro no painel”** aparece 14 vezes como `ERRO_DISPLAY` e uma vez como `TELA_ESCURA`, em `OC-2026-000629`.

Em `OC-2026-001830`, a descrição diz “motor liga e desliga, não gela”, mas o código declarado é `RUIDO_COMPRESSOR`. Pela descrição, `NAO_GELA` parece ser o sintoma principal.

Isso significa que **contar os problemas apenas pelo código que já vem preenchido pode fragmentar ou até subestimar o problema real**.

### 3. O campo `status` tem 15 grafias diferentes para 5 estados reais

Entre elas está `Reaberta`/`REABERTA`/`reaberta`, que aparece em 72 ocorrências, aproximadamente 3,5% da base.

Isso é interessante porque o procedimento formal diz que uma ocorrência fechada não deve ser reaberta. Nesse caso, deveria ser criada uma nova ocorrência.

Então existe uma dúvida que eu não quis resolver sozinha: ou o sistema permite algo que o procedimento não permite, ou o procedimento está desatualizado.

Como o próprio documento informa que ele não é revisado desde 2024, eu não trataria o procedimento como fonte de verdade sem antes confirmar isso com a operação.

### 4. O SLA registrado no sistema não diferencia Crítica de Alta

As duas prioridades aparecem com 72 horas no campo `sla_horas`.

Isso contradiz o procedimento, que informa 48 horas para Crítica, e também o que Marcela relata como prática, que seria 24 horas.

Ou seja, existe aqui um problema que vai além da triagem. Pode existir uma configuração no sistema que não corresponde à regra que deveria estar sendo aplicada.

Antes de usar qualquer SLA na solução, eu precisaria confirmar com a operação qual prazo é realmente válido.

### 5. A duplicidade cross-canal é maior do que o `id_origem` mostra

O `id_origem` identifica 75 casos.

Mesmo assim, encontrei outros 36 pares com a mesma série, no mesmo dia ou no dia seguinte, e em canais diferentes, mas sem vínculo registrado.

Isso reforça o relato da Marcela de que algumas ocorrências chegam repetidas por canais diferentes. O problema parece ser maior do que aquilo que o campo atual consegue capturar.

Se essas duplicidades não forem tratadas, o volume de ocorrências pode ficar artificialmente inflado.

### 6. Encontrei na base os dois padrões que a solução deveria conseguir detectar

**GCB247SLUV, Geladeira**

O modelo passa de aproximadamente 6 a 8 ocorrências por mês entre março e maio para um volume muito maior em julho e agosto.

O mais interessante é que esse crescimento aparece distribuído entre três códigos diferentes:

* `NAO_GELA`;
* `RUIDO_COMPRESSOR`;
* `TEMP_ALTA_GABINETE`.

São justamente os três exemplos que Marcela utiliza para explicar como problemas que parecem pequenos e diferentes podem, na verdade, representar um mesmo problema maior.

Além disso, aproximadamente 41% das ocorrências não possuem código.

Então, se eu simplesmente contasse cada código separadamente, poderia não enxergar o padrão.

**WMF60BW, Máquina de Lavar**

Esse modelo apresentou um pico isolado em julho, com 45 ocorrências contra uma média de aproximadamente 10 por mês.

A maior parte estava relacionada a `VAZAMENTO_AGUA`, e o volume já tinha caído em agosto.

Esse caso mostra uma coisa importante sobre a solução: se a análise fosse feita mensalmente, o pico de julho poderia ter sido identificado no início de agosto, antes que o problema se prolongasse por meses.

### 7. O custo também tem lacunas

O campo `custo_peca_brl` está ausente em 24% dos casos.

Por isso, qualquer estimativa de impacto financeiro que eu faça usando essa base deve ser entendida como um **piso de exposição**, e não como o custo total real.

---

## e) Perguntas que eu faria para a operação

Antes de transformar o protótipo em algo realmente operacional, eu levaria algumas perguntas para quem trabalha com esse processo:

1. **Qual é o prazo real para ocorrências Críticas?**
   Marcela fala em 24h, o procedimento fala em 48h e o sistema registra 72h. Qual dessas regras deve ser considerada a oficial?

2. **`Reaberta` é realmente um estado utilizado pela operação?**
   Se for, o procedimento provavelmente precisa ser atualizado. Se não for, precisamos entender por que esses registros existem.

3. **O que deve acontecer quando duas ocorrências são o mesmo problema vindo de canais diferentes?**
   Elas continuam sendo atualizadas separadamente ou uma deveria fazer referência à outra?

4. **Qual é o critério que a Qualidade considera para dizer que existe uma falha sistêmica?**
   O procedimento diz que não existe um critério objetivo desde 2024. A regra que usei, crescimento de pelo menos 2 vezes sobre a média dos meses anteriores, com um mínimo de 5 ocorrências, é uma hipótese minha e precisa ser validada.

5. **Faz sentido trabalhar com famílias de sintomas?**
   Por exemplo, `NAO_GELA`, `RUIDO_COMPRESSOR` e `TEMP_ALTA_GABINETE` poderiam ser agrupados como problemas relacionados ao sistema de refrigeração.

   Não fiz isso agora porque entendo que essa taxonomia precisa ser definida pela área, e não por mim sozinha.

6. **Quem deveria receber e revisar o alerta?**
   Ele deveria ir automaticamente para o Teams ou passar primeiro por uma pessoa?

   Essa pergunta é importante porque, segundo o dossiê, ainda não existe um responsável definido pela ferramenta depois da entrega.

---

## f) Como saberemos, em 30 dias, se funcionou?

A principal métrica que eu acompanharia seria:

> **Dos alertas gerados, quantos foram confirmados pela Qualidade como uma falha real de produto, e não como um problema isolado de unidade, instalação ou uso?**

Para os primeiros 30 dias, minha meta seria:

* pelo menos **1 alerta confirmado como verdadeiro**;
* uma taxa de falso-alarme **abaixo de 50%**.

Não quero medir o sucesso apenas pela quantidade de alertas gerados. O que importa é saber se a ferramenta consegue mostrar um problema **antes que ele fique óbvio para a operação**.

### Eu abandonaria ou redirecionaria a solução se:

**a)** mais da metade dos alertas fossem descartados pela Qualidade como ruído;

ou

**b)** nenhum alerta antecipasse alguma coisa que a Qualidade já não descobriria pelo processo mensal manual.

Nesse segundo caso, a ferramenta estaria apenas automatizando algo que a operação já consegue fazer e não estaria cumprindo o objetivo principal.

---

## g) Qualidade da saída de IA

Para avaliar a classificação, rotulei manualmente 20 casos reais em `eval/casos_rotulados_manual.csv`.

Usei somente a descrição livre e a linha de produto, sem olhar o `codigo_sintoma` que já existia na base.

### Uma limitação importante

Não havia `ANTHROPIC_API_KEY` disponível no ambiente em que fiz a análise.

Por isso, não consegui fazer essa avaliação usando uma chamada real à API. Fiz a classificação manualmente, seguindo exatamente o prompt utilizado em `src/classify.js`.

Isso cria um problema importante: a mesma pessoa produziu o rótulo considerado “verdade” e também a classificação comparada contra ele.

Então, **o número abaixo é otimista e não deve ser tratado como uma validação real do modelo**.

Antes de confiar nessa classificação em produção, eu faria uma avaliação às cegas com uma amostra maior. Minha sugestão seria pelo menos **100 casos**, rotulados por alguém que já faça esse julgamento na operação, como o Rodrigo, e compararia esses rótulos com a saída real da API.

### Resultado exploratório

Dos 20 casos:

* **17 (85%)** tiveram classificação inequívoca e confiança alta;
* **2 (10%)** tiveram confiança média;
* **1 (5%)** foi identificado como não classificável.

Os dois casos de confiança média envolveram uma ambiguidade que já existe na própria base. A expressão “erro no painel”, por exemplo, já aparece historicamente associada a categorias diferentes.

O caso não classificável também foi importante. A descrição “reincidência do mesmo problema” não traz informação suficiente para saber qual é o sintoma. Nesse caso, achei mais correto a solução não tentar adivinhar.

### Onde ainda não testei

A amostra não avaliou especificamente textos com:

* erros de digitação mais graves;
* abreviações;
* gírias;
* variações regionais.

Como esses padrões existem na base, eles deveriam entrar em uma avaliação futura.

### Como eu acompanharia isso em produção

1. observar se a taxa de `NAO_CLASSIFICADO` aumenta ao longo dos meses;
2. fazer uma auditoria mensal de uma amostra aleatória com alguém da operação;
3. acompanhar a evolução da confiança média da classificação;
4. considerar a confiança da IA como um filtro antes de usar uma classificação no cálculo do spike.

Hoje, a confiança já aparece na saída do classificador, mas ainda não é utilizada como filtro no pipeline. Esse seria um dos próximos passos que eu faria.

---

## O que ficou explicitamente de fora

Além do que expliquei na seção **a**, deixei alguns pontos fora desta primeira versão.

### 1. Filtro por confiança da IA

Hoje, todas as classificações entram no cálculo, inclusive as de baixa confiança.

É algo que eu faria em seguida, mas preferi não colocar no primeiro recorte por uma questão de tempo.

### 2. Agrupamento mais sofisticado de parceiros

A solução atual faz uma normalização e uma similaridade simples.

Isso não resolve todos os casos. Por exemplo, `MEGATEC` e `MegaTec Reparos` podem não ser agrupados.

Como isso não interfere em nenhuma decisão crítica da detecção de spike, não achei que valeria investir mais tempo nessa parte agora.

### 3. Envio automático para o Teams

O pipeline gera o alerta em `out/alertas.md`, pronto para ser revisado e utilizado.

Não automatizei o envio para o Teams porque ainda não está claro quem seria o responsável pelo alerta, quem deveria aprová-lo, quem deveria recebê-lo e o que deveria acontecer depois de um alerta ser confirmado.

Antes de automatizar uma comunicação real, eu preferiria responder essas perguntas.

---

## h) Declaração de uso de IA

Usei o **Claude Code (Sonnet 5)** como apoio para:

* ler o dossiê e comparar com a minha própria interpretação;
* fazer a análise exploratória da base;
* pensar a arquitetura da solução;
* apoiar a implementação do código.

### Os três prompts mais úteis foram:

**1. Exploração da base**

> “Explore a base ocorrencias.csv: quais campos têm mais nulos, que duplicatas existem, e existe algum modelo com crescimento anômalo de ocorrências mês a mês?”

Foi esse prompt que ajudou a encontrar os casos `GCB247SLUV` e `WMF60BW`, que acabaram sendo importantes para a solução.

**2. Priorização do problema**

> “Dado esse dossiê, e-mail da coordenadora + procedimento formal + pedido da diretoria, qual desses pontos de vista é o gargalo real, e por que os outros dois pedidos existem por um motivo que não é o problema em si?”

Esse raciocínio me ajudou a decidir que não faria sentido tentar atender aos três pedidos ao mesmo tempo e que o chatbot deveria ficar fora do escopo.

**3. Classificação restrita de sintomas**

O próprio prompt de `src/classify.js`:

> “Escolha o código somente entre os permitidos para essa linha de produto, ou diga que não dá para classificar.”

Restringir a IA aos códigos que já existem foi uma decisão importante para não deixar a classificação completamente aberta.

### Dois momentos em que a IA errou e eu corrigi

**1. Avaliação da classificação**

Na primeira tentativa de montar os 20 casos, os mesmos rótulos que estavam sendo usados como “verdade” também acabavam sendo usados como referência para a “predição”.

Isso poderia produzir uma acurácia artificialmente alta.

Corrigi isso ampliando a amostra com casos mais difíceis e deixando explícita a limitação de autoconsistência, em vez de apresentar um número de acurácia que pareceria mais confiável do que realmente era.

**2. Escopo da solução**

Na primeira leitura do pedido da diretoria, a IA sugeriu uma arquitetura com duas frentes, chatbot e alerta, para contemplar todos os pedidos.

Depois, ao confrontar isso com a regra do desafio, **“se você está construindo a quarta tela, já errou o exercício”**, e com o fato de que ainda não havia orçamento, dono ou alinhamento operacional para o chatbot, revi a decisão.

O chatbot ficou fora da entrega e foi mantido apenas como uma possibilidade futura.

---

## Síntese da decisão

No fim, a solução que escolhi responde a uma pergunta bem específica:

> **Como transformar milhares de ocorrências fragmentadas em um sinal antecipado de que determinado produto pode estar apresentando um problema sistêmico?**

Para isso, combinei:

**dados normalizados + deduplicação + interpretação de texto por IA + regra determinística de detecção + alerta auditável.**

A ideia não é substituir a operação. É ajudar a operação a perceber **mais cedo** quando vários problemas aparentemente isolados podem estar apontando para o mesmo problema maior.
