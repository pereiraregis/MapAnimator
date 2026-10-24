# Fluxo de animação — v0.9.0

## Timeline organizada

O transporte e os menus ficam fixos enquanto tracks e inspector têm rolagem própria. Os comandos ficam em **Editar**, **Interpolação**, **Tempo**, **Presets**, **Exibição** e **Área de prévia**. Erros aparecem junto aos controles, sem exigir rolar até o fim da lista.

A coluna de propriedades começa mais larga e mostra valores amostrados em tempo real. Arraste sua divisória ou use **Exibição → Coluna de propriedades** para ajustar. Expandir/recolher todas as camadas também fica nesse menu. Shift+clique nos nomes de camadas/propriedades adiciona ou remove seus keys da seleção; clique simples substitui a seleção.

**F**, com foco na timeline, enquadra os keys selecionados. Sem seleção, mostra a duração inteira. **Ctrl/Cmd + roda** ou gesto de zoom amplia o tempo sob o cursor. A régua usa intervalos adaptativos com um mínimo de um frame. O contador mostra o frame absoluto e a quantidade de keys selecionados, sem simular timecode drop-frame.

## Presets editáveis

1. Clique no nome de um pin, área ou rota na timeline.
2. Posicione o cursor no começo desejado e abra **Presets**.
3. Escolha a duração e o efeito. A operação deve caber tanto na composição quanto no intervalo visível da camada.

**Entrada suave** e **Saída suave** animam opacidade; **Pop de entrada** combina opacidade e escala do pin, com leve sobressalto; **Pulso de destaque** cresce e retorna à escala original; **Desenhar rota** cria a revelação de 0 a 1. O menu oferece apenas efeitos compatíveis com o tipo da camada.

Os efeitos geram keys nativos com Easy Ease, selecionados para edição em **G / Graph Editor**. São uma única operação de undo. Só substituem keys das propriedades afetadas dentro do intervalo do efeito; keys fora dele e outras propriedades são preservados. Entrada/pulso usam os valores do estilo original do catálogo; saída parte do valor atual da opacidade. Um elemento originalmente invisível continua invisível. Desenhar rota requer geometria de rota para produzir imagem.

Como o sampler mantém o primeiro/último valor fora dos keys, a entrada mantém opacidade zero antes do efeito e a saída mantém zero depois, salvo quando existem outros keys. Fade-out não restaura automaticamente a opacidade: use undo, edite os keys ou aplique uma entrada posterior. Presets de três keys exigem duração suficiente para não cair no mesmo frame. Camadas bloqueadas não aceitam presets.

## Duração e sequenciamento

Selecione keys, abra **Tempo** e use **Usar intervalo da seleção** para carregar seus tempos. Ajuste **Início** e **Duração**, depois **Aplicar duração**. A operação distribui os keys proporcionalmente e divide as velocidades temporais pelo fator de duração, preservando as influências. Não altera valores nem os keys não selecionados. O arredondamento ocorre em frames; colisões ou intervalos inválidos cancelam toda a operação. Para alterações com keys vizinhos não selecionados, revise as curvas nas fronteiras.

Para uma sequência de pins/áreas, selecione os keys de várias camadas com Shift+clique nos seus nomes ou seleção por retângulo. Posicione o cursor e use **Tempo → Escalonar** com o intervalo desejado. O primeiro key selecionado de cada camada começa no cursor mais seu índice vezes o intervalo, respeitando a ordem da árvore. Os demais keys selecionados da camada preservam seus deslocamentos relativos. **Alinhar** faz o mesmo com intervalo zero. Essas ações movem keys, sem mover as barras de presença das camadas. Colisões, limites e bloqueios são verificados atomicamente; cada ação tem um undo.

## Área de prévia

A faixa azul no topo da régua mostra a área de prévia. Arraste as alças para ajustar entrada/saída ou pressione **B / N** no cursor, com foco na timeline. **Área de prévia** contém os campos numéricos, Loop e restauração da duração inteira. Ela continua sendo uma configuração de sessão e não recorta a exportação. Alterar a duração da composição restaura a área inteira.

## Verificação e limites

131 testes Rust (28 de core MapAnimator, 14 da interface/integração egui e 89 upstream), 68 JavaScript e smoke do WASM compilado. Os testes egui acionam menus reais com ponteiro, aplicam preset/duração e arrastam a alça de prévia; verificam zoom ancorado e a ausência de zoom na rolagem vertical normal. A integração mantém o formato de cena anterior.

O navegador CUA falhou novamente no volume E: com erro 1393. Layout visual, gestos no navegador real, WebGL e exportação PNG/MP4 não foram revalidados nesta entrega. O compositor completo do EffectCraft, Tauri e exportação JSX para After Effects continuam pendentes. Veja [validação](VALIDATION.md) e [camadas](LAYER_TIMELINE.md).
