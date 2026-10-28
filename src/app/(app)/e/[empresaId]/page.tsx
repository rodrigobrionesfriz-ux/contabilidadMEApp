import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { clp, param, rangoAnio, MESES } from '@/lib/formato';
import { traerTodo } from '@/lib/paginar';
import { estadoPrimerosPasos } from '@/lib/datos/primeros-pasos';
import { entradaF29 } from '@/lib/datos/f29';
import { calcularF29Anual, type MesF29 } from '@/tributario/f29';
import { dteC, dteV } from '@/motor/dte';
import { MODULOS } from '@/lib/modulos';
import { resumenAnual, variacion, mesConMovimiento, saldosContrarios, gastosPorCuenta, esDisponible, type SumaMes } from '@/estados/resumen';
import { GraficoLineas } from '@/components/grafico-lineas';
import { VentanaPrimerosPasos } from './primeros-pasos/ventana';
import { anioContable } from '@/lib/anio-contable';

// Resumen de la empresa: se abre al elegirla en Empresas.
// Todo sale de los asientos del año (balance_comprobacion de cada mes) y del
// cálculo del F29, igual que el resumen del sistema actual.

const pctTxt = (v: number | null) => (v == null || !Number.isFinite(v) ? '' : `${v > 0 ? '+' : ''}${v.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`);
const ABR = MESES.map((m) => m.slice(0, 3));

interface DocMes { tipo: string; tipo_dte: number | null; neto: number; exento: number; iva: number; estado: string | null; asiento_id: string | null }

function Kpi({ icono, color, titulo, valor, sub, colorValor }: { icono: string; color: string; titulo: string; valor: string; sub?: string; colorValor?: string }) {
  return (
    <div className="tarjeta flex items-center gap-4 p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg font-bold" style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>{icono}</div>
      <div className="min-w-0">
        <div className="text-xs font-medium text-tenue">{titulo}</div>
        <div className="num truncate text-2xl font-semibold" style={{ color: colorValor }}>{valor}</div>
        {sub && <div className="text-xs text-tenue">{sub}</div>}
      </div>
    </div>
  );
}

function TablaDocs({ titulo, docs, info }: { titulo: string; docs: DocMes[]; info: (c: number) => { nm: string; signo?: number } | null }) {
  const g: Record<number, { n: number; neto: number; iva: number; nm: string }> = {};
  for (const d of docs) {
    const t = Number(d.tipo_dte) || 0, s = info(t)?.signo ?? 1;
    const k = (g[t] ??= { n: 0, neto: 0, iva: 0, nm: info(t)?.nm ?? `DTE ${t}` });
    k.n++; k.neto += (Number(d.neto) + Number(d.exento)) * s; k.iva += Number(d.iva) * s;
  }
  const filas = Object.entries(g).sort((a, b) => +a[0] - +b[0]);
  const tot = filas.reduce((s, [, x]) => ({ n: s.n + x.n, neto: s.neto + x.neto, iva: s.iva + x.iva }), { n: 0, neto: 0, iva: 0 });
  return (
    <table className="w-full text-xs">
      <thead className="text-tenue uppercase"><tr className="border-b border-borde"><th className="py-1 text-left">{titulo}</th><th className="text-right">Cant.</th><th className="text-right">Neto + exento</th><th className="text-right">IVA</th></tr></thead>
      <tbody>
        {filas.length ? filas.map(([t, x]) => (
          <tr key={t} className="border-b border-borde/30"><td className="py-1">{t} · {x.nm}</td><td className="num text-right">{x.n}</td><td className="num text-right">{clp(x.neto)}</td><td className="num text-right">{clp(x.iva)}</td></tr>
        )) : <tr><td colSpan={4} className="py-2 text-tenue">Sin documentos en el mes</td></tr>}
      </tbody>
      {filas.length > 0 && <tfoot className="font-semibold"><tr><td className="py-1">Total</td><td className="num text-right">{tot.n}</td><td className="num text-right">{clp(tot.neto)}</td><td className="num text-right">{clp(tot.iva)}</td></tr></tfoot>}
    </table>
  );
}

export default async function InicioEmpresa({ params, searchParams }: PageProps<'/e/[empresaId]'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const bienvenida = param(sp.bienvenida) === '1';
  const sinAcceso = MODULOS.find((m) => m.k === param(sp.sin_acceso));
  const empresa = await requerirEmpresa(empresaId);
  const anio = Number(param(sp.anio)) || await anioContable();
  const acumulado = param(sp.acum) === '1';
  const supabase = await crearClienteServidor();

  const sumasMes = Array.from({ length: 12 }, (_, i) => {
    const r = rangoAnio(anio, i + 1, i + 1);
    return supabase.rpc('balance_comprobacion', { p_empresa: empresaId, p_desde: r.desde, p_hasta: r.hasta });
  });
  const [pp, f29Entrada, ...meses] = await Promise.all([estadoPrimerosPasos(empresaId), entradaF29(empresaId, anio).catch(() => null), ...sumasMes]);
  for (const m of meses) if (m.error) throw new Error(m.error.message);
  const R = resumenAnual(meses.map((m) => (m.data ?? []) as SumaMes[]));
  let f29: MesF29[] = [];
  try { f29 = f29Entrada ? calcularF29Anual(f29Entrada) : []; } catch { f29 = []; }

  const hoy = new Date();
  const tope = anio === hoy.getFullYear() ? hoy.getMonth() + 1 : 12;
  const mes = Math.min(12, Math.max(1, Number(param(sp.mes)) || mesConMovimiento(R, tope)));
  const i = mes - 1, ant = mes > 1 ? i - 1 : null;
  const hasta = Math.max(tope, mes);
  const per = `${anio}-${String(mes).padStart(2, '0')}`;
  const fin = rangoAnio(anio, mes, mes).hasta;

  const [docsMes, sinAsiento, declF29] = await Promise.all([
    traerTodo((d, h) => supabase.from('documentos').select('tipo,tipo_dte,neto,exento,iva,estado,asiento_id')
      .eq('empresa_id', empresaId).in('tipo', ['venta', 'compra'])
      .or(`and(tipo.eq.venta,fecha.gte.${per}-01,fecha.lte.${fin}),and(tipo.eq.compra,periodo.eq.${per})`).range(d, h)) as Promise<DocMes[]>,
    supabase.from('documentos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId).eq('anio', anio)
      .in('tipo', ['venta', 'compra']).is('asiento_id', null).neq('estado', 'anulado'),
    supabase.from('f29_declaraciones').select('periodo').eq('empresa_id', empresaId).gte('periodo', `${anio}-01`).lte('periodo', `${anio}-12`),
  ]);
  const vigentes = docsMes.filter((d) => d.estado !== 'anulado');

  // KPI
  const ing = R.ingresos[i], gas = R.gastos[i], res = ing - gas;
  const margen = ing ? (res / ing) * 100 : null;
  const disp = R.disponible[i];
  const resAcum = R.resultadoAcumulado[i];
  const fm = f29[i];
  const vs = (a: number, b: number | undefined) => (ant != null && b ? `${pctTxt(variacion(a, b))} vs ${MESES[ant].toLowerCase()}` : undefined);

  // Observaciones
  const obs: { nivel: 'peligro' | 'aviso' | 'info'; texto: string; href?: string }[] = [];
  for (const c of saldosContrarios(R, mes)) obs.push({ nivel: 'aviso', texto: `${c.cuenta} ${c.nombre} tiene ${c.motivo} (${clp(c.saldo)}).`, href: `/e/${empresaId}/mayor?anio=${anio}&cuenta=${c.cuenta}` });
  if (sinAsiento.count) obs.push({ nivel: 'peligro', texto: `${sinAsiento.count} documento(s) del año sin asiento contable.`, href: `/e/${empresaId}/libro?tipo=compra` });
  const conF29 = new Set((declF29.data ?? []).map((d) => d.periodo));
  const faltanF29 = Array.from({ length: mes - 1 }, (_, k) => k).filter((k) => !conF29.has(`${anio}-${String(k + 1).padStart(2, '0')}`)).map((k) => ABR[k]);
  if (faltanF29.length) obs.push({ nivel: 'info', texto: `F29 sin guardar: ${faltanF29.join(', ')}.`, href: `/e/${empresaId}/f29?anio=${anio}` });

  // Consulta de saldo
  const cuentas = Object.keys(R.netoCuenta).sort();
  const cta = R.netoCuenta[param(sp.cuenta)] ? param(sp.cuenta) : cuentas.find(esDisponible) ?? cuentas[0] ?? '';
  const serieCta = cta ? R.netoCuenta[cta].slice(0, hasta).reduce<number[]>((a, v) => { a.push(acumulado ? (a.at(-1) ?? 0) + v : v); return a; }, []) : [];
  const topGastos = gastosPorCuenta(R, mes);
  const maxG = topGastos[0]?.monto || 1;
  const etq = ABR.slice(0, hasta);
  const ventasMes = f29.length ? f29.slice(0, hasta).map((m) => m.ventasNetas + m.ventasExentas) : [];
  const comprasMes = f29.length ? f29.slice(0, hasta).map((m) => m.comprasNetas) : [];
  const base = `/e/${empresaId}`;

  return (
    <div className="space-y-5">
      {bienvenida && <VentanaPrimerosPasos empresaId={empresaId} razonSocial={empresa.razon_social} pasos={pp.pasos} hechos={pp.hechos} total={pp.total} escribe={puedeEscribir(empresa.rol)} />}
      {sinAcceso && <p role="alert" className="rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">🔒 Tu perfil no tiene acceso a {sinAcceso.nombre}. Si lo necesitas, pídeselo al administrador del sistema.</p>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{empresa.razon_social}</h1>
          <p className="text-sm text-tenue">Resumen de {MESES[i].toLowerCase()} {anio}</p>
        </div>
        <form className="flex flex-wrap items-end gap-2">
          {cta && <input type="hidden" name="cuenta" value={cta} />}
          {acumulado && <input type="hidden" name="acum" value="1" />}
          <div><label className="etiqueta" htmlFor="mes">Mes</label>
            <select id="mes" name="mes" defaultValue={mes} className="campo w-40">{MESES.map((m, k) => <option key={m} value={k + 1}>{m}</option>)}</select></div>
          <button className="boton-sec">Ver</button>
          <Link href={`${base}/diario`} className="boton-sec">📖 Libro diario</Link>
          {puedeEscribir(empresa.rol) && <Link href={`${base}/asientos/nuevo`} className="boton">✍️ Nuevo asiento</Link>}
        </form>
      </div>

      {!pp.completo && (
        <Link href={`${base}/primeros-pasos`} className="tarjeta block space-y-2 border-acento/50 p-4 hover:border-acento">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-semibold text-acento">🚀 Primeros pasos: {pp.hechos} de {pp.total}</span>
            <span className="text-xs text-tenue">{pp.faltanObligatorios ? `Faltan ${pp.faltanObligatorios} pasos clave · ` : ''}Siguiente: {pp.pasos.find((x) => x.estado === 'pendiente')?.titulo} →</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2"><div className="h-full bg-acento" style={{ width: `${(pp.hechos / pp.total) * 100}%` }} /></div>
        </Link>
      )}
      {empresa.rol === 'admin' && !cuentas.length && (
        <Link href={`${base}/importar`} className="tarjeta block border-acento/50 p-4 hover:border-acento">
          <div className="font-semibold text-acento">📥 Trae tus datos del sistema anterior</div>
          <div className="text-sm text-tenue">Sube el respaldo Excel de cada año para cargar asientos, documentos y saldos.</div>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi icono="$" color="var(--acento)" titulo="Ingresos del mes" valor={clp(ing)} sub={vs(ing, ant != null ? R.ingresos[ant] : undefined)} colorValor="var(--acento)" />
        <Kpi icono="↗" color="var(--peligro)" titulo="Gastos del mes" valor={clp(gas)} sub={vs(gas, ant != null ? R.gastos[ant] : undefined)} colorValor="var(--peligro)" />
        <Kpi icono="%" color="var(--info)" titulo="Margen del mes" valor={margen == null ? '—' : `${margen.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`} sub={`Resultado ${clp(res)}`} colorValor={margen != null && margen < 0 ? 'var(--peligro)' : 'var(--info)'} />
        <Kpi icono="🏦" color="var(--aviso)" titulo="Disponible (caja y bancos)" valor={clp(disp)} sub={`Al cierre de ${MESES[i].toLowerCase()}`} colorValor={disp < 0 ? 'var(--peligro)' : undefined} />
        <Kpi icono="🧾" color="var(--info)" titulo="Impuestos del mes (F29)" valor={clp(fm?.totalPagar ?? 0)} sub={fm ? `IVA ${clp(fm.ivaAPagar)} · PPM ${clp(fm.ppm)}` : undefined} />
        <Kpi icono="Σ" color="var(--acento)" titulo="Resultado del ejercicio" valor={clp(resAcum)} sub={`Enero a ${MESES[i].toLowerCase()}`} colorValor={resAcum < 0 ? 'var(--peligro)' : 'var(--acento)'} />
      </div>

      <div className="grid gap-3 xl:grid-cols-3">
        <div className="tarjeta p-4 xl:col-span-2">
          <div className="mb-2 text-xs font-semibold tracking-wide text-tenue uppercase">Ventas y compras mensuales (neto + exento)</div>
          <GraficoLineas id="vc" etiquetas={etq} marcar={i} series={[{ nombre: 'Ventas', color: 'var(--info)', valores: ventasMes }, { nombre: 'Compras', color: 'var(--aviso)', valores: comprasMes }]} />
        </div>
        <div className="tarjeta space-y-3 p-4">
          <div className="text-xs font-semibold tracking-wide text-tenue uppercase">Documentos de {MESES[i].toLowerCase()}</div>
          <TablaDocs titulo="Ventas" docs={vigentes.filter((d) => d.tipo === 'venta')} info={dteV} />
          <TablaDocs titulo="Compras" docs={vigentes.filter((d) => d.tipo === 'compra')} info={dteC} />
        </div>
        <div className="tarjeta p-4 xl:col-span-2">
          <div className="mb-2 text-xs font-semibold tracking-wide text-tenue uppercase">Ingresos, gastos y resultado acumulado</div>
          <GraficoLineas id="ig" etiquetas={etq} marcar={i} series={[
            { nombre: 'Resultado acumulado', color: 'var(--info)', valores: R.resultadoAcumulado.slice(0, hasta) },
            { nombre: 'Ingresos', color: 'var(--acento)', valores: R.ingresos.slice(0, hasta) },
            { nombre: 'Gastos', color: 'var(--peligro)', valores: R.gastos.slice(0, hasta), punteada: true },
          ]} />
        </div>
        <div className="tarjeta space-y-2 p-4">
          <div className="text-xs font-semibold tracking-wide text-tenue uppercase">Observaciones a revisar</div>
          {obs.length ? obs.map((o, k) => {
            const cls = `flex gap-2 rounded-md px-3 py-2 text-sm ${o.nivel === 'peligro' ? 'bg-peligro/10' : o.nivel === 'aviso' ? 'bg-aviso/10' : 'bg-panel-2'}`;
            const ico = o.nivel === 'peligro' ? '⛔' : o.nivel === 'aviso' ? '⚠️' : 'ℹ️';
            return o.href
              ? <Link key={k} href={o.href} className={`${cls} hover:opacity-80`}><span>{ico}</span><span>{o.texto}</span></Link>
              : <div key={k} className={cls}><span>{ico}</span><span>{o.texto}</span></div>;
          }) : <p className="text-sm text-tenue">✅ No hay observaciones para este mes.</p>}
        </div>
        <div className="tarjeta p-4 xl:col-span-2">
          <div className="mb-2 text-xs font-semibold tracking-wide text-tenue uppercase">Consulta de saldo</div>
          <form className="mb-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="mes" value={mes} />
            <select name="cuenta" defaultValue={cta} className="campo min-w-0 flex-1">
              {cuentas.map((cd) => <option key={cd} value={cd}>{cd} · {R.nombres[cd]}</option>)}
            </select>
            <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="acum" value="1" defaultChecked={acumulado} />Saldo acumulado</label>
            <button className="boton-sec">Ver</button>
          </form>
          {cta ? (
            <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
              <GraficoLineas id="sc" etiquetas={etq} marcar={i} alto={240} ancho={520} series={[{ nombre: acumulado ? 'Saldo acumulado' : 'Movimiento neto del mes', color: 'var(--info)', valores: serieCta }]} />
              <table className="w-full text-xs">
                <thead className="text-tenue uppercase"><tr className="border-b border-borde"><th className="py-1 text-left">Período</th><th className="text-right">{acumulado ? 'Saldo' : 'Neto'}</th></tr></thead>
                <tbody>{serieCta.map((v, k) => (
                  <tr key={k} className={`border-b border-borde/30 ${k === i ? 'bg-panel-2 font-semibold' : ''}`}>
                    <td className="py-1">{ABR[k]} {anio}</td><td className={`num text-right ${v < 0 ? 'text-peligro' : ''}`}>{clp(v)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          ) : <p className="text-sm text-tenue">Sin movimientos en {anio}.</p>}
        </div>
        <div className="tarjeta p-4">
          <div className="mb-3 text-xs font-semibold tracking-wide text-tenue uppercase">Gastos por cuenta · enero a {MESES[i].toLowerCase()}</div>
          {topGastos.length ? topGastos.map((g) => (
            <div key={g.cuenta} className="mb-2.5 grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto] items-center gap-2 text-xs">
              <span className="truncate" title={g.cuenta}>{g.nombre}</span>
              <span className="h-2 overflow-hidden rounded-full bg-panel-2"><span className="block h-full rounded-full bg-acento" style={{ width: `${Math.max(2, (g.monto / maxG) * 100)}%` }} /></span>
              <span className="num text-tenue">{clp(g.monto)}</span>
            </div>
          )) : <p className="text-sm text-tenue">Sin gastos registrados.</p>}
        </div>
      </div>
    </div>
  );
}
