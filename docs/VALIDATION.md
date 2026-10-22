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
