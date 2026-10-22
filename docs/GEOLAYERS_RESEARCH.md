# MapAnimator: referência GEOlayers 3 e plano de evolução

Pesquisa em 22/10/2026. Base analisada: branch `main` de `pereiraregis/MapAnimator`. A branch padrão do remoto é `gh-pages`; ela contém a publicação, não o ambiente de desenvolvimento completo.

## Objetivo e abordagem

Aproximar o fluxo de criação e a capacidade de mapas animados usando React, MapLibre GL JS 4.7 e Theatre.js já presentes no projeto. O produto de referência funciona dentro do After Effects; o MapAnimator atual é uma aplicação web. Paridade de câmera no navegador não significa paridade de camadas nativas no AE. Esta implementação é independente e não utiliza código ou assets do produto comercial.

## Comparação verificável

| Área | Referência GEOlayers 3 | MapAnimator após esta alteração | Próximo trabalho |
| --- | --- | --- | --- |
| Câmera | Latitude, longitude, zoom, bearing, pitch e keyframes | Theatre.js, Capture e controles numéricos de câmera | Waypoints com duração e easing |
| Elementos geográficos | Busca e browser de features | Browser de GeoJSON, seleção no mapa, filtro, visibilidade e enquadramento | Busca com download de geometria por provedor |
| Desenho | Shape layers editáveis no AE | Pontos, linhas e polígonos em camadas WebGL com estilos por elemento | Exportador de shapes e câmera para AE |
| Rótulos | Templates e composições AE | Pin com texto para cada elemento selecionado | Colisão, prioridade, idiomas e templates |
| Estilos | Basemap e estilos de features | Estilos OpenFreeMap existentes e cor, opacidade, traço e raio por elemento | Editor de camadas do basemap e estilos externos |
| Rotas | Desenho e animação de percursos | Desenho existente e conversão de LineString para rota `pathProgress` | Distância geodésica, antimeridiano, roteamento e GPX |
| Dados | CSV/TSV e estilos orientados por dados | Propriedades GeoJSON preservadas e inspecionáveis | CSV com mapeamento de colunas e escalas quantitativas |
| Projetos | Mapcomps e assets vinculados ao projeto AE | Arquivo JSON com settings, câmera, pins, elementos, rota e estado Theatre | Migração de schema e gerenciamento de assets externos |
| Finalização | Imagery para animação e resolução do AE | Exportadores existentes; espera por carregamento de tiles, contagem corrigida e créditos gravados no frame | Captura dedicada, cancelamento e limite de memória |
| Terreno e edifícios | Elevação e integrações com plugins 3D | Não implementados nesta versão do código | DEM com provedor configurável, extrusões e ponte 3D |

O README anterior anunciava terreno 3D, mas o `App.js` analisado não continha `setTerrain` nem o fluxo de aquisição de DEM. Tratar como pendência, não como funcionalidade validada.

## Referências primárias e decisões

1. [GEOlayers 3 — página oficial e tutoriais](https://aescripts.com/geolayers/): referência de fluxo e funcionalidades. Consultar as seções Animate in 3D Space, Online Search, Labels e Data Visualization. A página lista dependências externas para paisagens 3D.
2. [GEOlayers — Help e Scripting API](https://github.com/GEOlayers/Help/blob/main/README.md): `Mapcomp`, camada âncora, `setViewAtTime`, `draw`, `addLabel` e `finalize`. Uma integração que chame `geolayers3.*` exige GEOlayers instalado e painel aberto; não serve como motor independente para nosso aplicativo.
3. [MapLibre — API Map](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/): `addSource`, `addLayer`, `queryRenderedFeatures`, `fitBounds`, `setStyle` e eventos de carregamento. Usamos APIs também disponíveis na versão 4.7 do projeto; a documentação pública pode mostrar funcionalidades posteriores.
4. [MapLibre — especificação de estilos](https://maplibre.org/maplibre-style-spec/): fontes GeoJSON e propriedades/expression de fill, line, circle e symbol. A edição de features usa dados separados do basemap, recriados após `style.load`.
5. [GeoJSON — RFC 7946](https://www.rfc-editor.org/rfc/rfc7946): longitude antes de latitude, WGS84, geometrias e anéis. A importação rejeita coordenadas inválidas, anéis abertos, geometrias vazias e GeometryCollection. Limite de 10 MB e 5000 features por arquivo. Não reprojeta sistemas de coordenadas.
6. [Theatre.js — projetos e persistência](https://www.theatrejs.com/docs/latest/manual/projects): estado exportável e `getProject(..., {state})`; carregamento assíncrono com `project.ready`. Salvar apenas os elementos do mapa perderia os keyframes, portanto o formato de projeto inclui o estado Theatre.
7. [OpenFreeMap — integração e estilos](https://openfreemap.org/quick_start/): estilos e créditos dos provedores. Créditos DOM não aparecem em uma captura WebGL; são compostos no canvas de exportação.
8. [Nominatim — política oficial](https://operations.osmfoundation.org/policies/nominatim/): sem autocomplete no endpoint público, identificação da aplicação, cache e máximo de uma requisição por segundo. A busca foi alterada para envio explícito e uma fila/cache por sessão. Para publicação com múltiplos usuários, o limite é agregado por aplicação: migrar para backend com controle global ou um provedor dimensionado. A fila local não garante o limite global. Endpoint compatível pode ser configurado pela chave localStorage `mapanimator.geocoder`.
9. [MapTiler — APIs oficiais](https://docs.maptiler.com/cloud/api/): estilos, tiles, geocoding, dados e elevação. Opção futura; requer credenciais e avaliação das condições do plano. Nenhuma chave foi incluída e a pesquisa não ativa serviços pagos.
10. [Adobe CEP — recursos oficiais](https://github.com/Adobe-CEP/CEP-Resources): base para um painel com comunicação ao host e execução de ExtendScript. Confirmar a compatibilidade com as versões de AE suportadas antes de empacotar.

## Implementação seguinte, em ordem de dependência

### 1. Consolidar o editor e a renderização

Adicionar edição numérica de câmera e waypoints com tempo, easing e pausa. Extrair o exportador do `App.js`, usar uma instância de mapa em resolução de saída e codificar frames em lotes. Hoje todos os frames PNG ficam em memória; sequências longas em Full HD podem exceder a memória do navegador. Evitar prometer 4K até medir memória, qualidade e tempo. Testar trocas de estilo, carregamento tardio, zoom/pitch, falha de rede, pins e atribuições.

### 2. Dados e geometrias

Definir interface de provedores separando geocoding, geometrias completas, tiles, elevação e roteamento. Adicionar CSV/TSV com escolha explícita de longitude/latitude ou chave de união a features. Não inferir coordenadas silenciosamente. Construir escalas de cores/tamanhos com tratamento de valores nulos. Operações topológicas e antimeridiano exigem testes próprios; enquadramento atual usa bbox simples. O rótulo de polígono usa o centro da bbox, que pode ficar fora de polígonos côncavos; substituir por ponto interior de qualidade cartográfica.

### 3. Ponte independente para After Effects

Criar um pacote de intercâmbio versionado: composição (largura, altura, fps, duração), projeção/origem, amostras de câmera, elementos, estilos, textos, atribuições e caminhos relativos dos assets. Primeiro exportar sequência PNG + manifesto para AE, depois shapes/textos/câmera nativos. Definir uma origem Web Mercator e escala de unidades única; comparar pontos projetados em frames conhecidos com o navegador antes de transportar câmera inclinada. Render raster e shapes devem coincidir durante zoom, pitch e bearing. Não usar diretamente coordenadas em graus como pixels de shape layers.

Critério de aceite: abrir o pacote em uma instalação real do AE e confirmar alinhamento de três pontos conhecidos ao longo de uma animação, edição independente de texto/shape, créditos e relink dos assets. A pesquisa de CEP não equivale a uma integração pronta.

### 4. Terreno e edifícios

Separar preview (MapLibre DEM / fill-extrusion) de exportação de geometria para AE. Escolher provedor de elevação, resolução, unidades, exagero vertical e fallback sem DEM. Avaliar disponibilidade de altura em dados OSM. As integrações Helium/FreeForm/Plexus da referência não fornecem automaticamente esses recursos ao MapAnimator.

## Validação manual desta entrega

1. Abrir o aplicativo e clicar em **Exemplo**: três features aparecem na lista e no mapa.
2. Selecionar polígono, mudar cor/opacidade e alternar sua visibilidade. Trocar o basemap: elementos, pins e rota devem permanecer.
3. Criar rótulo de um ponto. Selecionar uma LineString e usar **Animar rota**. No Studio, sequenciar `pathProgress` de 0 a 1.
4. Salvar projeto; alterar a cena; abrir o arquivo salvo ou a cópia local. Conferir os keyframes no Studio e as features.
5. Importar um GeoJSON inválido: exibir o erro sem substituir a cena existente.
6. Exportar PNG curto, conferir quantidade de frames e créditos no rodapé. MP4 também depende do carregamento do FFmpeg remoto.

Abrir um projeto substitui a cena atual e recarrega a página para inicializar o estado Theatre. Salve a cena atual antes. O arquivo GeoJSON exportado contém as propriedades originais; estilos e visibilidade ficam no arquivo de projeto MapAnimator.
