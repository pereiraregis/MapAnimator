import React, { useRef } from 'react';
import { curveOf } from './geo/animation';

export default function CurveEditor({ point, next, disabled, onChange, onBegin, onEnd }) {
  const svg = useRef(null), drag = useRef(null);
  const c = curveOf(point);
  const x = v => 28 + v * 284, y = v => 132 - v * 112;
  const move = e => {
    if (drag.current === null || disabled) return;
    const r = svg.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width * 340, py = (e.clientY - r.top) / r.height * 160;
    const curve = [...c];
    curve[drag.current * 2] = Math.max(0, Math.min(1, (px - 28) / 284));
    curve[drag.current * 2 + 1] = Math.max(0, Math.min(1, (132 - py) / 112));
    onChange({ easing: 'bezier', curve });
  };
  const finish = () => { if (drag.current !== null) { drag.current = null; onEnd(); } };
  return <div className="curve-editor" aria-label="Editor de curvas Bézier">
    <div><strong>CURVA DE INTERPOLAÇÃO</strong><span>{point.time.toFixed(2)} s → {next.time.toFixed(2)} s</span></div>
    <svg ref={svg} viewBox="0 0 340 160" onPointerMove={move} onPointerUp={finish} onPointerCancel={finish}>
      <path className="curve-grid" d="M28 20H312V132H28ZM28 76H312M170 20V132" />
      <path className="curve-diagonal" d="M28 132L312 20" />
      <path className="curve-handle-line" d={`M28 132L${x(c[0])} ${y(c[1])}M312 20L${x(c[2])} ${y(c[3])}`} />
      <path className="curve-path" d={point.easing === 'hold' ? 'M28 132H312V20' : `M28 132C${x(c[0])} ${y(c[1])} ${x(c[2])} ${y(c[3])} 312 20`} />
      {point.easing !== 'hold' && [0, 1].map(i => <circle key={i} className="curve-handle" cx={x(c[i * 2])} cy={y(c[i * 2 + 1])} r="7" tabIndex={disabled ? -1 : 0} role="slider" aria-label={`Alça Bézier ${i + 1}`} aria-valuemin="0" aria-valuemax="1" aria-valuenow={c[i * 2]} aria-valuetext={`X ${c[i * 2].toFixed(2)}, Y ${c[i * 2 + 1].toFixed(2)}`} onPointerDown={e => { if (disabled) return; e.preventDefault(); onBegin(); drag.current = i; e.currentTarget.setPointerCapture(e.pointerId); }} onKeyDown={e => {
        if (disabled || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation(); const curve = [...c], axis = ['ArrowLeft', 'ArrowRight'].includes(e.key) ? 0 : 1;
        curve[i * 2 + axis] = Math.max(0, Math.min(1, curve[i * 2 + axis] + (['ArrowRight', 'ArrowUp'].includes(e.key) ? .02 : -.02)));
        onBegin(); onChange({ easing: 'bezier', curve }); onEnd();
      }} />)}
      <text x="28" y="154">Tempo →</text><text x="225" y="14">Progresso ↑</text>
    </svg>
    <div className="curve-values">{['X1', 'Y1', 'X2', 'Y2'].map((label, i) => <label key={label}>{label}<input aria-label={`Curva ${label}`} type="number" min="0" max="1" step="0.01" value={Number(c[i].toFixed(3))} disabled={disabled || point.easing === 'hold'} onChange={e => { const curve = [...c]; curve[i] = Math.max(0, Math.min(1, Number(e.target.value))); onBegin(); onChange({ easing: 'bezier', curve }); onEnd(); }} /></label>)}</div>
  </div>;
}
