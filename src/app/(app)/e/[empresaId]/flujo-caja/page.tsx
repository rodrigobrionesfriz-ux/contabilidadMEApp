import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { saldosAuxiliar } from '@/lib/datos/auxiliares';
import { flujoRealizado, flujoProyectado, esCuentaEfectivo, type Pendiente } from '@/tesoreria/flujo';
import { clp, param, hoyISO, MESES } from '@/lib/formato';
import { BotonImprimir } from '@/components/boton-imprimir';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Flujo de caja' };

interface Linea { id: number; cuenta: string; fecha: string; numero: number; tipo: string; glosa: string; debe: number; haber: number }

export default async function FlujoCajaPage({ params, searchParams }: PageProps<'/e/[empresaId]/flujo-caja'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const anio = Number(param(sp.anio)) || await anioContable();
  const vista = param(sp.vista) === 'proyectado' ? 'proyectado' : 'realizado';
  await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const hoy = hoyISO();
  const lineas = (await traerTodo((d, h) => supabase.rpc('lineas_cuentas', { p_empresa: empresaId, p_prefijo: '1101', p_desde: `${anio}-01-01`, p_hasta: `${anio}-12-31` }).range(d, h)) as Linea[])
    .filter((l) => esCuentaEfectivo(l.cuenta)).map((l) => ({ ...l, fecha: String(l.fecha).slice(0, 10), debe: Number(l.debe), haber: Number(l.haber) }));
  const esApertura = (l: Linea) => l.tipo === 'apertura' || l.numero === 0 || /apertura/i.test(l.glosa || '');
  const f = flujoRealizado(lineas.map((l) => ({ fecha: l.fecha, debe: l.debe, haber: l.haber, apertura: esApertura(l) })));
  let p: ReturnType<typeof flujoProyectado> | null = null;
  if (vista === 'proyectado') {
    const corte = anio === +hoy.slice(0, 4) ? hoy : `${anio}-12-31`;
    const efectivo = lineas.filter((l) => l.fecha <= corte).reduce((s, l) => s + l.debe - l.haber, 0);
    const [cli, prov, hon] = await Promise.all([saldosAuxiliar(empresaId, 'cliente', corte, hoy), saldosAuxiliar(empresaId, 'proveedor', corte, hoy), saldosAuxiliar(empresaId, 'honorario', corte, hoy)]);
    const pend: Pendiente[] = [
      ...cli.flatMap((r) => r.items.filter((i) => i.saldo > 0).map((i) => ({ vence: i.vence || i.fecha, monto: i.saldo, tipo: 'cobrar' as const }))),
      ...[...prov, ...hon].flatMap((r) => r.items.filter((i) => i.saldo > 0).map((i) => ({ vence: i.vence || i.fecha, monto: i.saldo, tipo: 'pagar' as const }))),
    ];
    p = flujoProyectado(efectivo, pend, hoy);
  }
  const kpi = (l: string, v: number, tono = '') => <div className="tarjeta p-3"><p className="text-[10px] text-tenue uppercase">{l}</p><p className={`num text-base font-semibold ${tono}`}>{clp(v)}</p></div>;
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Flujo de caja · {anio}</h1>
          <div className="mt-2 flex gap-1 text-sm">
            <Link href={`?anio=${anio}`} className={`rounded-md px-3 py-1.5 ${vista === 'realizado' ? 'bg-panel-2 font-medium text-acento' : 'text-tenue hover:text-texto'}`}>💵 Realizado</Link>
            <Link href={`?anio=${anio}&vista=proyectado`} className={`rounded-md px-3 py-1.5 ${vista === 'proyectado' ? 'bg-panel-2 font-medium text-acento' : 'text-tenue hover:text-texto'}`}>🔮 Proyectado</Link>
          </div>
        </div>
        <div className="flex items-end gap-2">
          <form className="flex items-end gap-2"><input type="hidden" name="vista" value={vista} />
            <div><label className="etiqueta" htmlFor="anio">Año</label><select id="anio" name="anio" defaultValue={anio} className="campo w-28">{Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
            <button className="boton-sec">Ver</button></form>
          <BotonImprimir />
        </div>
      </div>
      {vista === 'realizado' ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpi('Saldo inicial', f.saldoInicial)}{kpi('Entradas', f.entradas, 'text-acento')}{kpi('Salidas', f.salidas, 'text-peligro')}{kpi('Saldo final', f.saldoFinal, f.saldoFinal < 0 ? 'text-peligro' : '')}</div>
          <p className="text-xs text-tenue">Movimiento real de caja y bancos (cuentas 1101xxx). Entradas = cargos; salidas = abonos. El saldo parte de la apertura. Los traspasos entre cuentas propias aparecen como entrada y salida.</p>
          <div className="tarjeta overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs text-tenue uppercase"><tr className="border-b border-borde"><th className="px-3 py-2">Mes</th><th className="px-2 py-2 text-right">Entradas</th><th className="px-2 py-2 text-right">Salidas</th><th className="px-2 py-2 text-right">Flujo neto</th><th className="px-3 py-2 text-right">Saldo</th></tr></thead>
            <tbody>{f.meses.map((m, i) => (
              <tr key={i} className={`border-b border-borde/40 ${!m.entradas && !m.salidas ? 'opacity-40' : ''}`}><td className="px-3 py-1.5">{MESES[i]}</td>
                <td className="num px-2 text-right text-acento">{m.entradas ? clp(m.entradas) : '–'}</td><td className="num px-2 text-right text-peligro">{m.salidas ? clp(m.salidas) : '–'}</td>
                <td className={`num px-2 text-right ${m.neto < 0 ? 'text-peligro' : 'text-acento'}`}>{clp(m.neto)}</td><td className={`num px-3 text-right font-semibold ${m.saldo < 0 ? 'text-peligro' : ''}`}>{clp(m.saldo)}</td></tr>
            ))}</tbody>
            <tfoot className="font-semibold"><tr className="border-t border-borde"><td className="px-3 py-1.5">Total año</td><td className="num px-2 text-right">{clp(f.entradas)}</td><td className="num px-2 text-right">{clp(f.salidas)}</td><td className="num px-2 text-right">{clp(f.entradas - f.salidas)}</td><td className="num px-3 text-right">{clp(f.saldoFinal)}</td></tr></tfoot>
          </table></div>
        </>
      ) : p && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kpi('Efectivo actual', p.efectivo)}{kpi('Por cobrar', p.cobrar, 'text-acento')}{kpi('Por pagar', p.pagar, 'text-peligro')}{kpi('Posición proyectada', p.posicionFinal, p.posicionFinal < 0 ? 'text-peligro' : 'text-acento')}</div>
          <p className="text-xs text-tenue">Parte del efectivo actual y suma, por tramo de vencimiento, el saldo pendiente de cada documento de clientes menos el de proveedores y honorarios (descontando pagos y notas de crédito). Sin fecha de vencimiento se usa la de emisión.</p>
          <div className="tarjeta overflow-x-auto"><table className="w-full text-sm">
            <thead className="text-left text-xs text-tenue uppercase"><tr className="border-b border-borde"><th className="px-3 py-2">Vencimiento</th><th className="px-2 py-2 text-right">Por cobrar</th><th className="px-2 py-2 text-right">Por pagar</th><th className="px-2 py-2 text-right">Flujo neto</th><th className="px-3 py-2 text-right">Posición</th></tr></thead>
            <tbody>{p.filas.map((t) => (
              <tr key={t.k} className="border-b border-borde/40"><td className="px-3 py-1.5">{t.lbl}</td><td className="num px-2 text-right text-acento">{t.cobrar ? clp(t.cobrar) : '–'}</td><td className="num px-2 text-right text-peligro">{t.pagar ? clp(t.pagar) : '–'}</td>
                <td className={`num px-2 text-right ${t.neto < 0 ? 'text-peligro' : 'text-acento'}`}>{clp(t.neto)}</td><td className={`num px-3 text-right font-semibold ${t.posicion < 0 ? 'text-peligro' : ''}`}>{clp(t.posicion)}</td></tr>
            ))}</tbody>
          </table></div>
          {(p.vencido.cobrar > 0 || p.vencido.pagar > 0) && <p className="text-xs text-peligro">⚠️ Hay {clp(p.vencido.cobrar)} por cobrar y {clp(p.vencido.pagar)} por pagar ya vencidos. Revísalos en Auxiliares.</p>}
        </>
      )}
    </div>
  );
}
