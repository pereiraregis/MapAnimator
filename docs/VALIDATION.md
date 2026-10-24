## v0.9.0 — 24/10/2026 — presets e fluxo de edição

- **131 testes Rust passaram**: 28 do core MapAnimator, 14 da UI/integração egui e 89 upstream (cor, geometria, keyframe, tempo e integração). Executado `cargo test --manifest-path rust/Cargo.toml --workspace --locked`; core/UI repetidos após o último ajuste de seleção em grupo.
- **68 testes JavaScript passaram em 11 suites**. As dependências de terceiros e os arquivos vendorizados não foram modificados.
- Novos testes de domínio verificam presets editáveis/persistidos, um undo, preservação de keys fora do efeito, bloqueios e intervalos curtos, retiming de velocidades, colisões atômicas, sequenciamento com offsets e revelação da rota.
- Novos testes egui headless acionam os menus reais Presets/Tempo com eventos de ponteiro, criam keys e aplicam duração. Outros arrastam uma alça da área de prévia, verificam zoom ancorado com Event::Zoom e ausência de zoom na rolagem vertical normal, e limites do enquadramento/régua. Os testes históricos de arraste, curvas, bloqueio e camadas continuam passando.
- Smoke do **WASM compilado** passou com duas sequências de 91 amostras, câmera/rota, objetos, curvas e constantes persistidas. SHA256 final: `4dfbbf8e763e3a4e9bff8dc5f9ed38fa89093c2971e893fc330d596c6c56d08c`; 8,858,356 bytes (2,418,761 gzip). SHA256 das fontes: `e81d69d7607bf2d9c4d63a308d912c15ee58a66e01098e31eebd7e01a2e1a2d5`.
- Build React de produção concluído: `main.60d6e404.js` (600,86 kB gzip), `main.581e7bb2.css` (15,63 kB gzip). Depois do ajuste final apenas em Rust, o módulo WASM/bindings/build-info e seus notices foram recompilados e sincronizados para o build. Hashes público/build conferem. Permanecem avisos existentes de dependência dinâmica, tamanho do bundle e Browserslist antigo.
- Duas tentativas de iniciar o navegador CUA falharam; diagnóstico: inicializador MXC no volume E:, `os error 1393`, estrutura do disco corrompida/ilegível. Layout real, responsividade, WebGL, clipboard, toque e exportação real PNG/MP4 continuam sem revisão visual nesta entrega. Testes headless não substituem essa verificação.
- Guia de uso e limites: [fluxo de animação](MOTION_WORKFLOW.md). Tauri, compositor completo e exportador After Effects continuam pendentes.

## v0.8.0 — 23/10/2026 — timeline por camadas

- **120 testes Rust**: 37 upstream keyframe, 20 upstream time, 22 core MapAnimator e nove interações egui. Comando: `cargo test --manifest-path rust/Cargo.toml --workspace --locked`.
- **68 testes JavaScript em 11 suites**: catálogo/identidades, pins animados sem mutar os originais, feature-state/limpeza, restauração de estilos de rota, validação de metadados, expressões de paint contra o style spec MapLibre instalado e ponte React/WASM (incluindo snapshot direto antes do polling).
- egui headless exercita seleção/arraste de keys e curvas, captura/bloqueio, trim de camada, deslocamento da barra em vários movimentos com um undo, preservação de histórico após atualização do catálogo e intervalos fora da duração. Isso não equivale a testar o DOM/WebGL.
- WASM compilado executado em Node: duas sequências de 91 frames (câmera/rota e objetos sem keys de câmera), curvas nativas, antimeridiano, presença temporal e constantes persistidas de pin/rota. SHA256: `fa5d904308c42f523e05f0a45e7c0ffc6fe6024609674602acd8fe43cd410286`; 8,715,123 bytes, 2,394,809 gzip. Fontes: `3361a344c47c3697fa3c0bc2363140acfa4237dbcea61225b5eb769bd848a3ed`.
- Build de produção: `main.1b2625fa.js` e `main.581e7bb2.css`; WASM público e build têm o mesmo SHA256. Permanecem avisos existentes de dependência dinâmica, bundle grande e Browserslist antigo. Os 15 arquivos vendorizados foram conferidos pelos Git blobs upstream durante o build.
- CUA voltou a falhar ao enumerar o volume E: (`os error 1393`). Aparência no navegador, WebGL, clipboard real, toque, responsividade e exportação real PNG/MP4 não foram revalidados. Não há captura visual nova.
- Tauri e exportador After Effects não estão implementados. Fluxo e limites atuais: [timeline por camadas](LAYER_TIMELINE.md).

## v0.7.0 — 23/10/2026 — migração Rust, etapa 1

- **70 testes Rust passaram**: 37 do módulo upstream de keyframes, 20 de tempo, nove do estado/compatibilidade MapAnimator e quatro de interações egui. Execução final com Cargo.lock: `cargo test --manifest-path rust/Cargo.toml -p mapanimator-core -p mapanimator-web -p effectcraft-keyframe -p effectcraft-time --lib --locked`.
- **60 testes JavaScript passaram em dez suites**, incluindo ponte React/WASM simulada: eventos de edição/amostragem, captura usando câmera real fornecida pelo callback, ativação do modo, atualização externa sem apagar o histórico de alterações próprias e isolamento dos atalhos do canvas. Suites anteriores de rota/pins continuam passando.
- Interações egui reais em contexto headless com eventos de ponteiro/teclado: arraste em vários movimentos, seleção por retângulo entre tracks, exclusão/undo, F9/undo e alça temporal alterando velocidade em um único undo. O teste revelou e corrigiu um erro de delta incremental: o arraste agora usa a posição original do ponteiro. Isso não equivale a testar WebGL/DOM no navegador.
- Teste de **WebAssembly compilado executado em Node**: 91 amostras de frame, valores de câmera/revelação, passagem pelo antimeridiano, curva nativa de saída e rejeição de entrada inválida. SHA256 do binário: `d65b3fa6ed779da39f02107717bba362c5df05692cfeba3581da7b94516d9e88`. Binário: 8.473.190 bytes (2.362.189 bytes gzip); o JS de bindings tem 80.279 bytes.
- Build de produção concluído: `main.6756efb7.js` (598,18 kB gzip), `main.581e7bb2.css` (15,63 kB gzip). Permanecem avisos existentes de dependência dinâmica, tamanho do bundle e Browserslist antigo. Licenças das dependências Rust/fontes acompanham o site; os 15 arquivos vendorizados conferem com os Git blobs upstream.
- Tentativa de abrir navegador/CUA voltou a falhar no inicializador do volume E: (`os error 1393`, estrutura do disco ilegível). Aparência final, WebGL, clipboard real, toque, responsividade e PNG/MP4 não foram verificados visualmente. Sem captura de tela nova ou alegação de teste visual.
- O mapa/rotas/pins continuam em JS; a timeline ativa, comandos e avaliação estão em Rust/egui/WASM. Exportação aguarda o motor e usa o mesmo sampler. Tauri e o exportador JSX para After Effects não foram implementados; a viabilidade e os limites estão documentados em `docs/RUST_MIGRATION.md` e `docs/AFTER_EFFECTS_EXPORT.md`.

## v0.6.0 — 23/10/2026

- **57 testes passaram em nove suites** na execução final: `npm test --prefix client -- --watchAll=false --runInBand --cacheDirectory=./node_modules/.cache/jest`.
- Build final de produção concluído: `main.b44e7537.js` (604,49 kB gzip), `main.4ba53bd0.css` (15,51 kB gzip). Permanecem avisos existentes de dependências dinâmicas, tamanho do bundle e dados antigos do Browserslist; sem falha de compilação.
- Lógica: equivalência de amostragem de cenas antigas após conversão, retiming independente, identidade estável, colisões atômicas, snap magnético, copiar/colar relativo com substituição no destino e limites, validação de curvas/canais, captura de uma propriedade e preparação de rota preservando as outras, conversão Theatre por propriedade, congelamento de propriedades sem keys e Easy Ease de entrada/saída.
- Interações React: arraste em vários movimentos preservando outras tracks e gerando um único undo; eventos copy/paste; seleção por retângulo entre propriedades; exclusão/desfazer; F9; contexto Hold; gráficos de valor/velocidade; alças Bézier e redimensionamento da timeline. Eventos/geometria do DOM são simulados nestes testes.
- Navegador/CUA não iniciou: inicializador falhou ao enumerar o volume E: com erro de estrutura do disco ilegível (`os error 1393`). Não houve validação visual final dos gestos reais, WebGL, layout responsivo ou PNG/MP4 nesta versão. A build e os testes não equivalem a essas verificações.
- Prévia/exportação compartilham o sampler por propriedade. Área de prévia/loop não corta a exportação; o modo Theatre continua separado. Detalhes da adaptação e diferenças: `docs/EFFECTCRAFT_REFERENCE.md`.

## v0.5.1 — 23/10/2026

- Build final concluído: main.53b2c446.js, cerca de 600,27 kB gzip; avisos existentes de dependências dinâmicas e tamanho do bundle.
- 41 testes passaram em oito suites, incluindo a nova lógica de revelação e o hook/componente de edição de pontos.
- Verificados: revelação em 0/25/75/99,5/100%, geometria vazia ou com um ponto, segmentos repetidos sem NaN, interpolação angular curta, criação de chaves de revelação, valores de câmera nos limites e preservação de chaves além da duração.
- Testes React com fonte/eventos de mapa simulados: inserir/arrastar ponto intermediário, câmera travada durante arraste, mouseup fora do mapa, blur com cancelamento, desfazer/refazer, aplicação de seis casas decimais, rejeição de coordenada inválida, exclusão e reconstrução após troca de estilo.
- Confirmado que alterar cor/geometria preserva o progresso e que fontes de alças/guia ficam vazias durante a captura. A ocultação da linha original importada foi testada mesmo com fontes em carregamento.
- Navegador não iniciou após tentativa e reset (falha do processo Node confiável); não foi possível validar o gesto real no canvas/WebGL nem exportar mídia visualmente nesta sessão. Os testes de mapa usam doubles das APIs; isso não equivale a um teste visual real. O pipeline de PNG/MP4 compartilha o sampler de rota, e overlays são ocultados antes do loop de captura.

## v0.5.0 — 23/10/2026

- **29 testes passaram em seis suites**, incluindo interações React: arraste/desfazer/refazer, alças Bézier, redimensionamento por pointer/teclado e transporte/captura no playhead nativo Theatre. A revisão final corrigiu os botões de frame para usarem o tempo nativo no modo Theatre.
- Build final de produção concluído: main.b8789a63.js, cerca de 597,29 kB gzip. Permanecem avisos de dependências dinâmicas e tamanho do bundle; sem falha de compilação.
- Testes de lógica cobrem retiming com snap/colisão/grupo, Bézier e hold, conversão de seis tracks com ângulos pelo caminho curto, geometria dos 177 países e territórios, preenchimento/contorno independente e dimensões de callouts.
- Navegador na implementação anterior à retomada: dois keyframes de zoom 12/10 em 0/3 s; arraste final para 2,53 s e desfazer em uma operação. Alterar Y1 para 0,8 gerou zoom 10,4 em 1,5 s. Brasil foi carregado do catálogo e preenchido.
- Conversão para Theatre abriu as seis tracks; o editor Tween mostrou os handles convertidos e o gráfico por propriedade abriu. Editar a curva de zoom para smooth fez o transporte fixo mostrar zoom 11 em 1,5 s, inclusive após salvar/reabrir.
- Consulta real de Campinas via Nominatim retornou polígonos. Área adicionada/preenchida, rótulo com linha de chamada, nome longo, visibilidade, duplicação e presets verificados; cena reaberta com dois elementos e dois pins.
- Na retomada de 23/10 o navegador de testes não iniciou devido a erro do inicializador no volume E: (estrutura do disco ilegível), repetido após reset. O terminal alternativo permitiu concluir testes/build/publicação. A revisão visual final e os breakpoints responsivos deste build não foram repetidos; o divisor de timeline foi validado por teste de interação React.
- Exportação PNG/MP4 e interação touch de mapa não foram revalidadas nesta versão. Vistas e Theatre são modos separados; a conversão preserva as vistas e substitui tracks nativas de câmera, sem conversão inversa das edições nativas. Limites e referências em docs/MOTION_AND_GEOGRAPHY.md.

## v0.4.1 — pins e créditos

- 19 testes passaram em quatro suites. Novos testes verificam limites de labels longos, offsets negativos/abaixo do pin e dimensões independentes de densidade da tela.
- Build de produção concluído com os avisos existentes de dependência dinâmica e tamanho do bundle (590,5 kB gzip).
- Navegador: P criou pin visível; arraste alterou coordenadas de (-46.633, -23.55) para (-46.588834, -23.567653) mantendo a câmera em (-46.633, -23.55). Texto e formato responderam às edições.
- Cena salva e reaberta preservou o pin, texto, formato e posição. Adicionar depois de reabrir não duplicou os pins existentes. Exclusão removeu o pin selecionado.
- Reproduzido defeito de pins sumindo ao trocar Bright por Dark: setStyle com diff removia as fontes personalizadas sem emitir style.load. Com diff:false, os pins reapareceram e criar novos pins continuou funcionando. Console sem erros no teste final.
- Créditos dinâmicos do provedor visíveis no rodapé do editor; nenhuma faixa de atribuição sobre a composição. A rotina de captura busca os créditos no editor e mantém a atribuição nos frames exportados.
- Exportação de mídia e interação touch não foram revalidadas nesta correção.

# Validação — 22/10/2026

## v0.4.0 — layout encaixado e atalhos

- **16 testes passaram** em três suites. Novos testes cobrem atalhos de transporte, composição IME, digitação em campos, modificadores, repetição de teclas e comandos reservados do navegador.
- Build de produção concluído; permanecem os avisos de dependência dinâmica e tamanho do bundle.
- Navegador: K capturou duas vistas; Espaço alternou reprodução/pausa; seta avançou um frame (timecode 00:00:01); Shift+seta avançou dez frames (00:00:10). Ocultar/reabrir a timeline com T preservou o tempo de 0,3333 s.
- Digitar Espaço e K no nome do projeto produziu `Projeto k`, sem executar os comandos do editor. P criou pin e abriu suas propriedades na aba fixa. Backslash recolheu/restaurou laterais e a ajuda abriu na aba de atalhos. Console sem erros nessas verificações.
- Em **1280×720**, laterais de 264/304 px, mapa com região de 712×437 px e timeline de 204 px ocuparam áreas separadas. O frame 16:9 permaneceu dentro da região central; não havia painéis flutuantes nem overflow horizontal.
- Em **800×720**, alternância de mapa/controles/inspetor exibiu uma região por vez. Em **390×844**, barra superior de 70 px, região de trabalho de 521 px, timeline de 226 px e status de 27 px ficaram dentro da tela, sem overflow horizontal. O override de viewport usado no teste foi restaurado ao final.
- Exportação MP4/PNG não foi repetida nesta atualização de layout. O exportador e o formato de cena foram preservados; a UI flutuante do Theatre deixou de ser exposta, mantendo leitura/exportação de tracks legadas.

## v0.3.0 — validação adicional

- **11 testes passaram** em duas suites: incluindo interpolação de câmera, caminho angular curto, easing, tempos duplicados, parsing CSV/TSV, campos entre aspas, coordenadas ausentes e restauração de estilos do mapa-base.
- Build de produção concluído com os mesmos tipos de aviso do bundler e tamanho (aproximadamente 588 kB gzip no JS principal).
- No navegador: capturadas vistas em 0 e 3 segundos, com zoom 12 e 10. Ao percorrer até 1,5 segundo, zoom 11 e longitude intermediária foram confirmados.
- Importado o arquivo real `public/examples/cities.csv`: três pontos, colunas reconhecidas e escala por `population`; São Paulo recebeu raio 25.
- Controles de rótulos, estradas e cor da água alterados sem erros no console. A cena foi salva e reaberta, preservando os pontos, o modo de câmera e as duas vistas.
- O modo de vistas usa o mesmo `sampleCamera` na prévia e no exportador. A exportação animada completa deste novo modo não foi revalidada manualmente; a validação de PNG abaixo refere-se ao pipeline da primeira atualização.

As adições opcionais ao schema v1 mantêm compatibilidade com projetos sem waypoints/aparência. Agrupamento de layers do basemap usa nomes e tipos das layers; estilos externos com convenções diferentes ou mapas raster podem não expor esses grupos.

## Evidências

- `npm test -- --watchAll=false --runInBand --cacheDirectory=./node_modules/.cache/jest`: **6 testes passaram**. Cobertura de geometrias, coordenadas inválidas, preservação de propriedades, visibilidade, bounds, serialização de cena, rejeição de projetos inválidos e reconstrução de layers durante troca de estilo.
- `npm run build`: **compilação de produção concluída**. Avisos: dependências dinâmicas do bundler, bundle principal de aproximadamente 584 kB gzip e base Browserslist antiga. Sem nova dependência de runtime.
- `node --check server.js`: passou. O servidor passou a iniciar após corrigir o wildcard do Express 5 (`/{*path}`). Referência: [migração oficial do Express 5](https://expressjs.com/en/guide/migrating-5/).
- Navegador local: exemplo com três geometrias; seleção; edição de nome, opacidade e traço; conversão de LineString para rota; criação de rótulo; troca Bright → Dark; salvar e reabrir projeto mantendo elementos, nome, estilo, pins e rota. Rótulo restaurado confirmado visualmente no bundle final.
- Exportação PNG: ZIP com **10 frames de 1920×1080** para 1 segundo a 10 fps. Primeiro frame inspecionado: mapa, polígono, linha e créditos do provedor presentes. A inspeção do ZIP ocorreu antes do último ajuste das layers de pins; o rótulo restaurado foi depois confirmado visualmente no build final.
- Regressão visual: proporção do canvas preservada e composição quadrada conferida; busca permanece disponível após abrir projeto. O HTML de teste recebeu query de versão para evitar que o navegador mantivesse o index de um build anterior em cache.

## Limites desta validação

MP4 não foi revalidado, embora o FFmpeg tenha carregado. Não foi validado um fluxo real de After Effects, terreno, roteamento viário, ingestão CSV/TSV ou exportação de shapes nativos: esses recursos permanecem no roadmap. A serialização da timeline foi testada e usa a API oficial do Theatre, mas uma sequência complexa com múltiplas tracks não foi exercitada manualmente nesta sessão. O teste de importação de arquivo GeoJSON foi realizado no validador; no navegador foi utilizado o exemplo que passa pelo mesmo caminho de normalização e criação de elementos.

O exportador ainda mantém os frames em memória e depende dos serviços de tiles e do FFmpeg remoto. As esperas por tiles têm timeout; sequências longas ainda exigem uma evolução do pipeline de memória/cancelamento.
