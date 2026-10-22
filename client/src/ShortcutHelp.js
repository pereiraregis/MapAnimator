import React from 'react';
import { SHORTCUTS } from './shortcuts';

export default function ShortcutHelp() {
  return <section className="shortcut-help" aria-label="Atalhos de teclado">
    <div className="feature-heading"><span>ATALHOS DE TECLADO</span><kbd>?</kbd></div>
    <p>Use os atalhos com o foco no mapa ou na área de trabalho. Campos de texto e valores mantêm suas teclas de edição.</p>
    <dl>{SHORTCUTS.map(([key, label]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>
    <p>Ctrl/⌘ + S e Ctrl/⌘ + O também funcionam durante a edição. Os atalhos ficam suspensos durante a renderização.</p>
  </section>;
}
