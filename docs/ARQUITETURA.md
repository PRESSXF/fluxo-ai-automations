# Arquitetura e decisões

Este documento explica como o Fluxo está organizado e por que cada escolha foi feita.

## Camadas

```
interface (React)        components/, hooks/useFlowEditor.ts, hooks/useSimulator.ts
        │
IA                       ai/generate.ts, ai/prompt.ts, ai/anthropic.ts, ai/demo/
        │
domínio (sem IA)         domain/catalog, graph, validate, engine, schema, layout, diff, history, templates
```

Cada camada só conhece a de baixo. O domínio não sabe que existe React nem modelo de linguagem; o motor recebe as etapas de IA por uma interface (`AiRuntime`) injetada. Isso deixa 131 testes rodando em menos de dois segundos, sem navegador e sem rede.

## Decisões

### 1. O modelo propõe, o esquema decide

**Problema.** Um modelo pode devolver um tipo de etapa que não existe, uma opção fora da lista, um número escrito por extenso ou uma ligação para uma etapa inventada. Se isso chega ao canvas, o usuário perde o trabalho ou fica com um fluxo que quebra na execução.

**Decisão.** Tudo que vem de fora (resposta da IA e arquivo importado) passa por `parseFlowDraft`, um validador escrito à mão a partir do catálogo. Campos desconhecidos, tipos inexistentes, opções inválidas, ids repetidos, saídas que a etapa não tem, ligações para gatilhos e limites de tamanho rejeitam a resposta inteira. Cada erro diz o caminho (`nodes[2].config.minutos`).

**Consequência.** O canvas só recebe fluxos bem formados. A interface mostra os erros e a resposta bruta, o que também ajuda a ajustar o prompt. Optei por não usar uma biblioteca de esquemas para manter mensagens em português, pensadas para quem usa, e o bundle pequeno.

### 2. Formato e regra de negócio são coisas diferentes

**Problema.** Um fluxo bem formado ainda pode estar errado: condição sem "senão", etapa solta, ciclo.

**Decisão.** Duas validações. O esquema (decisão 1) bloqueia o que não pode ser representado. A validação do grafo (`validateFlow`) aponta o que pode ser representado mas não deve rodar, com explicação e sugestão. Fluxo com erro de grafo pode ser aplicado e editado, mas não pode ser simulado.

**Consequência.** A IA pode entregar um rascunho com um problema pequeno sem que o usuário perca tudo; ele vê o problema na prévia, aplica e corrige.

### 3. "Senão" sempre explícito

**Problema.** Numa condição sem caminho para o "não", ninguém sabe se o autor esqueceu ou se nada deve acontecer.

**Decisão.** A validação exige as duas saídas de toda condição. Para "não fazer nada", existe a etapa **Encerrar**. Tanto o prompt do Claude quanto o leitor de demonstração ligam o "não" a um Encerrar quando a descrição não fala dele, e a prévia avisa.

**Consequência.** Todo fluxo diz o que acontece em todos os casos. O custo é uma etapa a mais no canvas.

### 4. Saída forçada por ferramenta

O provedor Claude chama a API de Mensagens com `tool_choice: { type: "tool", name: "montar_fluxo" }`. O modelo não tem como responder em texto livre; a entrada da ferramenta é o JSON. O `input_schema` da ferramenta tem o `enum` dos tipos de etapa e das saídas, e o prompt descreve cada campo a partir do mesmo catálogo usado pela validação, para os dois nunca divergirem. A classificação no simulador usa o mesmo recurso com o `enum` das categorias.

### 5. Regras de negócio no código, inclusive depois da IA

Condições (`valor > 200`, `contém "cancelar"`, `classificacao.categoria = reclamação`) são avaliadas em `evaluateCondition`, que entende número no formato brasileiro (`R$ 1.234,50`) e compara texto sem diferenciar acento nem maiúscula. Mesmo quando a IA classifica, o motor confere se a categoria devolvida está na lista configurada. Se não estiver, a etapa falha com explicação em vez de seguir por um caminho errado.

### 6. Motor como gerador assíncrono

**Problema.** O simulador precisa rodar passo a passo, no ritmo do usuário, e também de uma vez, para testes e avaliações.

**Decisão.** `executeFlow` é um `async function*` que entrega um registro por etapa (entrada, saída, ramo, relógio, avisos) e devolve um resumo no fim. `runFlow` só consome o gerador até o fim.

**Consequência.** O botão "Próximo passo" chama `next()`; "Rodar tudo" chama em sequência com um intervalo visual (zero com `prefers-reduced-motion`). Os testes usam `runFlow`. Esperas avançam um relógio virtual, então "esperar 1 dia" aparece como `+1 dia` na linha do tempo sem esperar nada. O evento original nunca é alterado: o motor trabalha numa cópia.

### 7. Falhas viram etapas com erro, não exceções

Campo ausente numa condição, mensagem sem destinatário, texto vazio para a IA, categoria fora da lista e queda do provedor viram uma etapa com status `erro` e mensagem clara; a execução para ali. Placeholder ausente num texto (`{{cliente.nome}}` sem nome) é `aviso`: a mensagem sai, mas o problema fica registrado. Há um limite de etapas por execução como segunda proteção contra ciclos.

### 8. Canvas feito à mão

**Problema.** Bibliotecas de diagramas resolvem muito, mas pesam e escondem justamente o que este projeto quer mostrar.

**Decisão.** Etapas são elementos posicionados dentro de uma camada com `transform: translate() scale()`; ligações são curvas SVG na mesma camada. Arrastar usa `pointer events` com um único passo de desfazer ao soltar; ligar é arrastar de uma saída e soltar sobre outra etapa; rolar move a visão e Ctrl + rolar (ou pinça) aproxima.

**Consequência.** O bundle inteiro fica em cerca de 95 kB comprimido. Toda a geometria (pontos de conexão, curvas, ponto médio) é função pura em `layout.ts`.

### 9. Layout de cima para baixo

Fluxos de pequenos negócios são fundos e estreitos: gatilho, duas ou três ações, uma condição. Na horizontal, um fluxo de 7 etapas ficava em 45% de zoom numa tela de notebook. Na vertical, cabe a 70% ou mais, e no celular também. O layout automático põe cada etapa no nível do caminho mais longo até ela, centraliza condições sobre os dois ramos ("sim" à esquerda) e dá coluna própria aos pontos onde dois caminhos se juntam, para a ligação não cruzar outras etapas.

### 10. Acessibilidade: o canvas não é o único caminho

A lista de etapas e o painel de propriedades permitem montar, ligar (campos "Próxima etapa"), editar e excluir sem arrastar nada. No canvas, cada etapa é focável com Tab, Enter abre as propriedades, setas movem e há atalhos para desfazer, duplicar, excluir e aproximar. Os diálogos usam `<dialog>` nativo. Cores de etapa e de ramo sempre vêm com rótulo, e os contrastes foram conferidos para AA. No celular, o canvas vira somente leitura e a edição acontece pela lista.

### 11. Persistência sem confiança

O fluxo atual é salvo no `localStorage` com atraso de 300 ms, dentro de `try/catch`. Ao abrir, o conteúdo salvo passa pelo mesmo esquema da importação; se estiver corrompido ou o armazenamento estiver bloqueado, o editor abre o modelo padrão. A chave da API fica em `sessionStorage` e some ao fechar a aba.

### 12. Modo demonstração honesto

A demo pública não pode depender de chave paga. O provedor de demonstração lê frases em português com regras determinísticas e devolve o mesmo JSON que o Claude devolveria, passando pela mesma validação. Ele normaliza o texto mantendo o comprimento, para casar padrões sem acento e recortar títulos do original com acento. A interface mostra "Modo demonstração" o tempo todo, e os tokens aparecem com `~` porque são estimados.

### 13. Avaliações medem estrutura

As 8 descrições de avaliação verificam o que importa para o negócio: gatilho e horário, a regra, o que vem antes dela, cada caminho, destinatário, canal e tempo de espera. Nenhuma compara texto de mensagem, porque um modelo real escreve diferente a cada vez. Cada verificação tem um `why`. O mesmo conjunto mede o Claude com `npm run eval` e uma chave.

## Limites conhecidos

- O modo demonstração entende um conjunto grande, mas finito, de frases. Fora dele, diz o que faltou em vez de inventar.
- Ações são simuladas: nada é enviado para WhatsApp, e-mail ou planilha de verdade.
- Um fluxo tem um gatilho só e cada saída leva a uma etapa; não há execução em paralelo nem laços intencionais.
- Mover etapas com o teclado cria um passo de desfazer por toque de seta.
- No celular o canvas é só leitura.
- A chamada direta do navegador para a API serve para a demo; em produção a chave ficaria num back-end.
