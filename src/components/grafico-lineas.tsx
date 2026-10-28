/**
 * Gráfico de líneas en SVG (sin librerías), con curvas suaves y relleno
 * degradado bajo la primera serie. Usa los colores del tema (variables CSS),
 * así que se ve bien en oscuro y en claro. Componente de servidor.
 */
export interface Serie { nombre: string; color: string; valores: number[]; punteada?: boolean }

// Curva monótona (Fritsch-Carlson): suave, pero sin pasarse de los datos
// (no dibuja valores negativos entre dos ceros).
function curva(pts: [number, number][]) {
  const n = pts.length;
  if (n < 2) return n ? `M${pts[0][0]},${pts[0][1]}` : '';
  const dx: number[] = [], d: number[] = [], m = Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; d[i] = (pts[i + 1][1] - pts[i][1]) / dx[i]; }
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], q = a * a + b * b;
    if (q > 9) { const t = 3 / Math.sqrt(q); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
  }
  const r = (v: number) => v.toFixed(1);
  let out = `M${r(pts[0][0])},${r(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    out += ` C${r(pts[i][0] + h)},${r(pts[i][1] + m[i] * h)} ${r(pts[i + 1][0] - h)},${r(pts[i + 1][1] - m[i + 1] * h)} ${r(pts[i + 1][0])},${r(pts[i + 1][1])}`;
  }
  return out;
}

const abrev = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '-' : '';
  if (a >= 1e9) return `${s}${(a / 1e9).toLocaleString('es-CL', { maximumFractionDigits: 1 })}MM`;
  if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString('es-CL', { maximumFractionDigits: 1 })}M`;
  if (a >= 1e3) return `${s}${Math.round(a / 1e3)}K`;
  return `${s}${Math.round(a)}`;
};
const clp = (v: number) => `$ ${Math.round(v).toLocaleString('es-CL')}`;

export function GraficoLineas({ id, series, etiquetas, alto = 210, ancho = 640, marcar }: {
  id: string; series: Serie[]; etiquetas: string[]; alto?: number; ancho?: number; marcar?: number;
}) {
  const W = ancho, H = alto, pl = 58, pr = 14, pt = 14, pb = 26;
  const todos = series.flatMap((s) => s.valores);
  let max = Math.max(0, ...todos), min = Math.min(0, ...todos);
  if (max === min) max = min + 1;
  const r = (max - min) / 4, p = Math.pow(10, Math.floor(Math.log10(r)));
  const paso = [1, 2, 2.5, 5, 10].map((k) => k * p).find((k) => k >= r) || r;
  max = Math.ceil(max / paso) * paso; min = Math.floor(min / paso) * paso;
  const x = (i: number) => pl + (W - pl - pr) * (etiquetas.length === 1 ? 0.5 : i / (etiquetas.length - 1));
  const y = (v: number) => pt + (H - pt - pb) * (1 - (v - min) / (max - min));
  const lineasGuia: number[] = [];
  for (let v = min; v <= max + paso / 2; v += paso) lineasGuia.push(v);
  const base = y(Math.max(min, 0));

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-tenue">
        {series.map((s) => (
          <span key={s.nombre} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-[3px] w-4 rounded" style={{ background: s.color }} />{s.nombre}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={series.map((s) => s.nombre).join(', ')}>
        <defs>
          {series.map((s, k) => (
            <linearGradient key={k} id={`${id}-g${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {lineasGuia.map((v) => (
          <g key={v}>
            <line x1={pl} x2={W - pr} y1={y(v)} y2={y(v)} stroke="var(--borde)" strokeWidth={1} strokeDasharray={v === 0 ? undefined : '3 4'} opacity={v === 0 ? 0.9 : 0.6} />
            <text x={pl - 8} y={y(v) + 3.5} textAnchor="end" fontSize={10} fill="var(--tenue)" className="num">{v === 0 ? '0' : abrev(v)}</text>
          </g>
        ))}
        {etiquetas.map((l, i) => (
          <text key={l + i} x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill={marcar === i ? 'var(--texto)' : 'var(--tenue)'} fontWeight={marcar === i ? 700 : 400}>{l}</text>
        ))}
        {marcar != null && marcar < etiquetas.length && <line x1={x(marcar)} x2={x(marcar)} y1={pt} y2={H - pb} stroke="var(--acento)" strokeWidth={1} opacity={0.3} />}
        {series.map((s, k) => {
          const pts = s.valores.map((v, i) => [x(i), y(v)] as [number, number]);
          const linea = curva(pts);
          return (
            <g key={s.nombre}>
              {k === 0 && pts.length > 1 && <path d={`${linea} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`} fill={`url(#${id}-g0)`} />}
              <path d={linea} fill="none" stroke={s.color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.punteada ? '5 5' : undefined} />
              {pts.map((pt2, i) => (
                <circle key={i} cx={pt2[0]} cy={pt2[1]} r={marcar === i ? 4.5 : 3} fill="var(--panel)" stroke={s.color} strokeWidth={2}>
                  <title>{`${s.nombre} · ${etiquetas[i]}: ${clp(s.valores[i])}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
