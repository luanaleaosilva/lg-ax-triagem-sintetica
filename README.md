# Triagem AX Center — detecção precoce de falha sistêmica

Fatia construída para o desafio técnico AX Center / LG Electronics. O que isso
faz, em uma frase: lê a base de ocorrências de campo, resolve o código de
sintoma quando ele vem em branco (usando IA sobre o texto livre do parceiro),
e gera um alerta curto quando um modelo específico está tendo muito mais
ocorrências do que o normal — o sinal de que pode ser um defeito de produto,
não de instalação.

Ver [`SOLUCAO.md`](SOLUCAO.md) para o raciocínio completo (gargalo escolhido,
o que ficou de fora, o que a base escondia, perguntas em aberto).

## Como rodar

Requer Node.js 18+.

```bash
npm install

# opcional — sem isso, a classificação por IA é pulada e o pipeline roda
# só com o código de sintoma já declarado na base (cobertura menor)
export ANTHROPIC_API_KEY=sk-ant-...

node src/pipeline.js
```

## O que esperar ver

- No terminal: quantas duplicatas cross-canal foram detectadas, quantas
  descrições foram classificadas por IA, e os alertas gerados.
- Em `out/alertas.md`: o texto de cada alerta, pronto pra colar no Teams
  (formato curto, sem jargão, dentro do limite de ~900 caracteres pedido pela
  operação).

## Estrutura

```
src/normalize.js   normalização de data, canal, status, parceiro, modelo
src/dedup.js       detecção de duplicata cross-canal (explícita + heurística)
src/classify.js    classificação de sintoma via IA (Anthropic API)
src/detect.js      regra de detecção de spike + template do alerta
src/pipeline.js    orquestra tudo, ponto de entrada
eval/               rotulagem manual de 20 casos + acurácia da classificação
dossie/, dados/     materiais originais do desafio (cópia, pra rodar isolado)
```
