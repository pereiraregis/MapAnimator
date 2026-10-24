> v0.9.0 adds a fixed toolbar, motion presets and timing commands. See [current workflow](MOTION_WORKFLOW.md). This page documents the layer model introduced in v0.8.0.

# Timeline por camadas — v0.8.0

A timeline Rust/egui agora organiza câmera, rota, pins e elementos geográficos em camadas com propriedades independentes. O mapa continua em MapLibre/React; a avaliação da animação e os comandos ficam em Rust/WASM.

## Uso

- Abra a seta da camada para mostrar suas propriedades. Camadas vazias começam recolhidas; propriedades com animação são expandidas ao carregar. Use o filtro ou **U**, com foco no canvas, para mostrar apenas propriedades animadas.
- **◇** captura uma propriedade no cursor; **K** continua capturando os seis canais de câmera/revelação. Selecione e arraste keyframes, use o inspector para valor/tempo e **G** para os gráficos de valor/velocidade e alças temporais. **F9**, **Shift+F9** e **Ctrl/Cmd+Shift+F9** aplicam Easy Ease, entrada e saída.
- Arraste o corpo da barra da camada para deslocar seus keyframes em conjunto. Arraste suas bordas para cortar a presença do objeto, sem mudar o tempo dos keys. O inspector também edita entrada/saída. O final é exclusivo, exceto o limite final de 600 s.
- O olho controla a presença da camada. O bloqueio protege os comandos da timeline e a edição manual de pins. A visibilidade original do elemento continua sendo respeitada. Esse bloqueio não cobre todas as ferramentas de edição geométrica de GeoJSON.
- A ação de reversão temporal, também no menu de contexto, inverte o subconjunto de keys selecionados em cada propriedade usando `effectcraft_keyframe::time_reverse`.
- Copiar/colar preserva tempos relativos e identificadores estáveis das propriedades. Não remapeia automaticamente keys de um pin para outro pin.

## Objetos animáveis

Pins têm longitude, latitude, opacidade (0–1), escala (0,5–3) e rotação. Alterar manualmente uma propriedade de pin já animada cria/atualiza seu key no cursor. Arrastar um pin pausa a reprodução e atualiza as coordenadas animadas ao soltar. A escala reaproveita a imagem do pin; ampliações podem perder nitidez.

Áreas, linhas e pontos têm opacidade e canais RGB (0–255). Linhas/polígonos também têm espessura; pontos têm raio. Preenchimento e contorno desativados continuam desativados, e uma cor própria de contorno é preservada. Para animar esses estilos, use as propriedades da timeline; os controles laterais continuam editando o estilo base. A rota tem revelação, opacidade, largura e RGB.

Uma animação apenas de objetos não cria vistas de câmera nem desloca a câmera. Ao excluir o último key de uma propriedade, o valor atual fica congelado e é salvo, inclusive para revelação da rota. A presença temporal recorta os objetos, sem recortar a duração da exportação.

## Persistência e renderização

Cenas mantêm o formato raiz existente e acrescentam `layerAnimation` versão 1: estado das camadas, tracks por UID e constantes de propriedades sem keys. Os seis canais anteriores conservam seus índices para compatibilidade. Salvar/exportar lê um snapshot direto do editor nativo, inclusive antes do próximo ciclo de eventos React.

Prévia e captura para PNG/MP4 usam o mesmo `SceneSampler` compilado para avaliar câmera e objetos. Cores/espessuras de elementos usam feature-state do MapLibre, evitando reenviar toda a geometria a cada frame. Trocar o mapa-base reaplica os estados. A execução não sobrescreve as posições/estilos originais do projeto.

Mudanças nos valores/nomes base preservam o histórico; alterações na estrutura das propriedades removem referências órfãs e reiniciam o histórico. Os limites globais continuam em 500 tempos distintos e 3.000 keys escalares.

## Reuso do EffectCraft e limites

As quatro crates de tempo, geometria, cor e keyframes continuam vendorizadas sem modificações, com verificação dos 15 Git blobs do commit [357b4c5](https://github.com/storytold/effectcraft/tree/357b4c5bd531f9032ad6dc02937dcc75ab293ee9). Além da interpolação nativa existente, esta versão chama a reversão temporal upstream e adapta `bar_color`/`trim_zones` da timeline egui em `rust/timeline-web/src/upstream_ui.rs`. A licença MIT é distribuída com o editor; veja [avisos](../THIRD_PARTY_NOTICES.md).

O modelo de objetos e a ponte MapLibre são adaptações do MapAnimator. Ainda não há compositor completo do EffectCraft, áudio, expressões, tangentes espaciais ou reorganização da ordem das camadas. Tauri e [exportação para After Effects](AFTER_EFFECTS_EXPORT.md) continuam como próximos trabalhos; não há instalador nem exportador JSX nesta versão.

Validação: 120 testes Rust, 68 JavaScript, interações reais egui em contexto headless e amostragem do WASM compilado. A revisão visual no navegador, WebGL, clipboard real, toque, responsividade e exportação real PNG/MP4 ficaram pendentes devido à falha do inicializador CUA no volume E:. Veja [registro de validação](VALIDATION.md).
