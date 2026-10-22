# Validação — 22/10/2026

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
