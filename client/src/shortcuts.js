export const SHORTCUTS = [
  ['Espaço', 'Reproduzir / pausar'], ['K', 'Capturar vista no tempo atual'],
  ['← / →', 'Voltar / avançar um frame'], ['Shift + ← / →', 'Voltar / avançar dez frames'],
  ['Home / End', 'Ir ao início / fim'], ['[ / ]', 'Vista anterior / próxima'],
  ['D / V', 'Desenhar rota / selecionar'], ['P', 'Adicionar pin no centro'],
  ['F', 'Enquadrar elemento selecionado'], ['N', 'Orientar mapa para o norte'],
  ['Ctrl/⌘ + S', 'Salvar projeto'], ['Ctrl/⌘ + O', 'Abrir projeto'],
  ['T', 'Mostrar / ocultar timeline'], ['G', 'Abrir / fechar editor de curvas'], ['\\', 'Modo foco: recolher laterais'],
  ['1 / 2 / 3', 'Controles / mapa / elementos'], ['?', 'Mostrar atalhos'],
  ['Esc', 'Pausar, sair do desenho e fechar ajuda'],
  ['Shift + clique / retângulo', 'Na timeline: selecionar vários keyframes'],
  ['Ctrl/⌘ + A / C / V / D', 'Na timeline: selecionar tudo / copiar / colar / duplicar'],
  ['Ctrl/⌘ + Z / Shift + Z', 'Na timeline: desfazer / refazer (mantenha Ctrl/⌘)'],
  ['Delete / Backspace', 'Na timeline: excluir keyframes selecionados'],
  ['F9 / Shift + F9', 'Na timeline: Easy Ease / Ease In'],
  ['Ctrl/⌘ + Shift + F9', 'Na timeline: Ease Out'],
];

export function shortcutAction(event) {
  if (event.defaultPrevented || event.isComposing || event.altKey) return null;
  const key = event.key;
  if (event.ctrlKey || event.metaKey) {
    if (event.repeat || event.shiftKey) return null;
    return key.toLowerCase() === 's' ? 'save' : key.toLowerCase() === 'o' ? 'open' : null;
  }
  if (event.target?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"]')) return null;
  if (event.target?.closest?.('[data-timeline]') && ['ArrowLeft', 'ArrowRight', 'Escape'].includes(key)) return null;
  if (event.target?.closest?.('[data-keyframe], [role="separator"]') && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(key)) return null;
  if (event.repeat && !['ArrowLeft', 'ArrowRight'].includes(key)) return null;
  if (key === 'ArrowLeft') return event.shiftKey ? 'backTen' : 'back';
  if (key === 'ArrowRight') return event.shiftKey ? 'forwardTen' : 'forward';
  if (key === '?') return 'help';
  if (event.shiftKey) return null;
  return ({ ' ': 'play', Home: 'start', End: 'end', '[': 'previous', ']': 'next',
    k: 'capture', d: 'draw', v: 'select', p: 'pin', f: 'fit', n: 'north',
    t: 'timeline', g: 'curves', '\\': 'focus', '1': 'controls', '2': 'map', '3': 'features', Escape: 'escape' })[key.length === 1 ? key.toLowerCase() : key] || null;
}
