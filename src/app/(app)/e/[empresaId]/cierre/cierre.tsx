'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clp, MESES, decimalCL, milesInput } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { cambiarMes, provisionIncobrables, provisionFeriado, cerrarEjercicio, reabrirEjercicio, generarApertura } from './acciones';

export interface DatosCierre {
  anio: number;
  meses: { periodo: string; cerrado: boolean; cerradoEn: string | null }[];
  resultado: { cuentas: string[]; ingresos: number; gastos: number; resultado: number };
  cierre: { numero: number; fecha: string; cerradoEn: string | null } | null;
  anulados: { numero: number; motivo: string }[];
  apertura: { numero: number } | null;
  clientes: number; estimacion: number; provVacaciones: number;
  vacaciones: { nombre: string; saldo: number | null; corridos: number; diario: number; monto: number; motivo?: string }[];
  capital: number; regimen: { k: string; corto: string; nm: string; correccionMonetaria: boolean };
}
const n2 = (n: number) => (+n || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function Cierre({ empresaId, d, escribe, admin }: { empresaId: string; d: DatosCierre; escribe: boolean; admin: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const [pct, setPct] = useState('2');
  const sugerido = d.vacaciones.reduce((s, v) => s + v.monto, 0);
  const ajusteSugerido = Math.max(0, sugerido - d.provVacaciones);
  const [fer, setFer] = useState(ajusteSugerido ? milesInput(Math.round(ajusteSugerido)) : '');
  const [factor, setFactor] = useState('');
  const [motivo, setMotivo] = useState('');
  const cerrado = !!d.cierre;
  const run = (f: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>, confirmar?: string) => {
    if (confirmar && !window.confirm(confirmar)) return;
    iniciar(async () => { const r = await f(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) router.refresh(); });
  };
  const montoInc = Math.round(d.clientes * (decimalCL(pct) || 0) / 100);
  const reajuste = Math.round(d.capital * (decimalCL(factor) || 0) / 100);
  return (
    <div className="space-y-4">
      <Mensaje {...msg} />

      <section className="tarjeta space-y-3 p-4 text-sm">
        <h2 className="font-semibold">1 · Meses del ejercicio</h2>
        <p className="text-xs text-tenue">Un mes cerrado no admite asientos nuevos ni anulaciones. Sólo un administrador cierra o reabre meses.{cerrado ? ' Con el ejercicio cerrado, todos los meses quedan cerrados: para reabrir uno, reabre primero el ejercicio.' : ''}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          {d.meses.map((m, i) => (
            <div key={m.periodo} className={`rounded-md border p-2 text-xs ${m.cerrado ? 'border-peligro/40 bg-peligro/5' : 'border-borde'}`}>
              <div className="font-medium">{MESES[i]}</div>
              <div className="text-tenue">{m.cerrado ? '🔒 Cerrado' : 'Abierto'}</div>
              {admin && !cerrado && <button type="button" className="mt-1 text-acento hover:underline" disabled={pendiente} onClick={() => run(() => cambiarMes(empresaId, m.periodo, !m.cerrado))}>{m.cerrado ? 'Reabrir' : 'Cerrar'}</button>}
            </div>
          ))}
        </div>
      </section>

      <section className="tarjeta space-y-4 p-4 text-sm">
        <h2 className="font-semibold">2 · Ajustes de cierre</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2 rounded-md border border-borde p-3">
            <h3 className="font-medium">🔻 Provisión de incobrables</h3>
            <p className="text-xs text-tenue">Cargo a 3302001 Castigo incobrables (gasto) y abono a 1105001 Estimación clientes incobrables (correctora del activo).</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div><p className="etiqueta">Clientes por cobrar</p><p className="num">{clp(d.clientes)}</p></div>
              <div><p className="etiqueta">Estimación actual</p><p className="num">{clp(d.estimacion)}</p></div>
              <div><label className="etiqueta" htmlFor="prov-pct">% incobrable estimado</label><input id="prov-pct" value={pct} onChange={(e) => setPct(e.target.value)} className="campo num" inputMode="decimal" /></div>
              <div><p className="etiqueta">Provisión</p><p className="num font-semibold">{clp(montoInc)}</p></div>
            </div>
            {escribe && <button type="button" className="boton-sec" disabled={pendiente || cerrado || !montoInc} onClick={() => run(() => provisionIncobrables(empresaId, d.anio, decimalCL(pct)), `¿Generar la provisión de incobrables por ${clp(montoInc)} al 31-12-${d.anio}?`)}>Generar provisión</button>}
          </div>
          <div className="space-y-2 rounded-md border border-borde p-3">
            <h3 className="font-medium">🏖️ Provisión de feriado legal</h3>
            <p className="text-xs text-tenue">Cargo a 3201011 Vacaciones y abono a 2105004 Provisión vacaciones. La sugerencia usa el saldo de vacaciones de cada trabajador, en días corridos, por su remuneración diaria (igual que en el finiquito).</p>
            {d.vacaciones.length > 0 ? (
              <table className="w-full text-xs">
                <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Trabajador</th><th className="text-right">Saldo hábiles</th><th className="text-right">Corridos</th><th className="text-right">Diario</th><th className="text-right">Monto</th></tr></thead>
                <tbody>{d.vacaciones.map((v) => (
                  <tr key={v.nombre} className="border-b border-borde/30"><td className="py-0.5">{v.nombre}{v.motivo && <span className="text-aviso"> · {v.motivo}</span>}</td><td className="num text-right">{v.saldo == null ? '–' : n2(v.saldo)}</td><td className="num text-right">{v.corridos ? n2(v.corridos) : ''}</td><td className="num text-right">{v.diario ? clp(v.diario) : ''}</td><td className="num text-right">{v.monto ? clp(v.monto) : ''}</td></tr>
                ))}</tbody>
                <tfoot className="font-semibold"><tr><td className="py-1" colSpan={4}>Provisión requerida · ya provisionado {clp(d.provVacaciones)}</td><td className="num text-right">{clp(sugerido)}</td></tr></tfoot>
              </table>
            ) : <p className="text-xs text-tenue">Sin trabajadores con saldo de vacaciones.</p>}
            <div className="flex items-end gap-2">
              <div><label className="etiqueta" htmlFor="prov-fer">Monto a provisionar</label><input id="prov-fer" value={fer} onChange={(e) => setFer(milesInput(e.target.value))} className="campo num w-40" inputMode="numeric" placeholder="0" /></div>
              {escribe && <button type="button" className="boton-sec" disabled={pendiente || cerrado || !(decimalCL(fer) > 0)} onClick={() => run(() => provisionFeriado(empresaId, d.anio, decimalCL(fer)), `¿Generar la provisión de feriado por ${clp(decimalCL(fer))} al 31-12-${d.anio}?`)}>Generar provisión</button>}
            </div>
            {ajusteSugerido > 0 && <p className="text-[10px] text-tenue">Sugerido: {clp(ajusteSugerido)} (requerido menos lo ya provisionado).</p>}
          </div>
        </div>
        <div className="space-y-2 rounded-md border border-borde p-3">
          <h3 className="font-medium">📉 Corrección monetaria (referencial)</h3>
          {d.regimen.correccionMonetaria
            ? <p className="text-xs text-acento">ℹ️ Régimen {d.regimen.corto} · {d.regimen.nm}: sujeto a corrección monetaria del Art. 41 LIR. Usa el factor oficial del SII para el año.</p>
            : <p className="text-xs text-peligro">⛔ Régimen {d.regimen.corto} · {d.regimen.nm}: no está sujeto a corrección monetaria del Art. 41 LIR. Este cálculo es sólo informativo; no registres asientos por este concepto.</p>}
          <div className="flex flex-wrap items-end gap-4 text-xs">
            <div><p className="etiqueta">Capital propio (grupo 23)</p><p className="num">{clp(d.capital)}</p></div>
            <div><label className="etiqueta" htmlFor="cm-factor">Factor de reajuste anual (%)</label><input id="cm-factor" value={factor} onChange={(e) => setFactor(e.target.value)} className="campo num w-28" inputMode="decimal" placeholder="Ej. 3,4" /></div>
            <div><p className="etiqueta">Reajuste referencial</p><p className="num font-semibold">{clp(reajuste)}</p></div>
          </div>
          <p className="text-[10px] text-tenue">El SII publica el factor en sii.cl → Valores y fechas → Corrección monetaria. En regímenes sujetos: cargo a Corrección monetaria (resultado) y abono a Fondo de revalorización del capital propio, como asiento manual.</p>
        </div>
      </section>

      <section className="tarjeta space-y-3 p-4 text-sm">
        <h2 className="font-semibold">3 · Cierre del ejercicio</h2>
        <p className="text-xs text-tenue">Traspasa el resultado del año a 2303001 Resultados acumulados y deja en cero las cuentas de ingresos y gastos (por cuenta, auxiliar y centro de costo) al 31 de diciembre. Cierra los 12 meses.</p>
        <table className="w-full max-w-md text-sm"><tbody>
          <tr><td className="py-1">Ingresos (grupo 4)</td><td className="num text-right text-acento">{clp(d.resultado.ingresos)}</td></tr>
          <tr><td className="py-1">Costos y gastos (grupo 3)</td><td className="num text-right text-peligro">{clp(d.resultado.gastos)}</td></tr>
          <tr className="border-t border-borde font-bold"><td className="py-1.5">{d.resultado.resultado >= 0 ? 'UTILIDAD' : 'PÉRDIDA'} DEL EJERCICIO</td><td className={`num text-right ${d.resultado.resultado >= 0 ? 'text-acento' : 'text-peligro'}`}>{clp(d.resultado.resultado)}</td></tr>
        </tbody></table>
        {cerrado ? (
          <div className="space-y-2 rounded-md border border-aviso/40 p-3">
            <p>🔒 Ejercicio {d.anio} cerrado con el asiento N° {d.cierre!.numero} del {d.cierre!.fecha.split('-').reverse().join('/')}.</p>
            {escribe && (
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-72 flex-1"><label className="etiqueta" htmlFor="motivo">Motivo de reapertura (queda en auditoría)</label><input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} className="campo" placeholder="Al menos 10 caracteres" /></div>
                <button type="button" className="boton-sec" disabled={pendiente || motivo.trim().length < 10} onClick={() => run(() => reabrirEjercicio(empresaId, d.anio, motivo), `¿Reabrir el ejercicio ${d.anio}? Se anulará el asiento de cierre N° ${d.cierre!.numero} (conserva su número) y los meses vuelven a como estaban.`)}>🔓 Reabrir ejercicio</button>
              </div>
            )}
          </div>
        ) : d.resultado.cuentas.length === 0 ? <p className="text-xs text-tenue">No hay cuentas de resultado con saldo que cerrar.</p>
          : escribe && <button type="button" className="boton" disabled={pendiente} onClick={() => run(() => cerrarEjercicio(empresaId, d.anio), `¿Cerrar el ejercicio ${d.anio}?\n\nSe saldarán ${d.resultado.cuentas.length} cuentas de resultado contra Resultados acumulados (${clp(d.resultado.resultado)}) al 31-12-${d.anio} y se cerrarán los 12 meses.`)}>🔒 Cerrar ejercicio {d.anio}</button>}
        {d.anulados.length > 0 && <p className="text-xs text-tenue">Cierres anteriores anulados: {d.anulados.map((a) => `N° ${a.numero}${a.motivo ? ` (${a.motivo})` : ''}`).join(' · ')}</p>}
      </section>

      <section className="tarjeta space-y-3 p-4 text-sm">
        <h2 className="font-semibold">4 · Apertura de {d.anio + 1}</h2>
        <p className="text-xs text-tenue">Crea el asiento N° 0 al 1 de enero de {d.anio + 1} con los saldos de activos, pasivos y patrimonio. En clientes, proveedores y honorarios conserva cada documento con saldo (RUT, tipo y folio), así los auxiliares y pagos siguen funcionando.</p>
        {d.apertura ? <p>✅ {d.anio + 1} ya tiene apertura (asiento N° {d.apertura.numero}). Para rehacerla, anúlala en el libro diario y vuelve a generarla.</p>
          : !cerrado ? <p className="text-xs text-aviso">Primero cierra el ejercicio {d.anio}.</p>
          : escribe && <button type="button" className="boton" disabled={pendiente} onClick={() => run(() => generarApertura(empresaId, d.anio + 1), `¿Generar la apertura de ${d.anio + 1} con los saldos al 31-12-${d.anio}?`)}>🔰 Generar apertura {d.anio + 1}</button>}
      </section>
    </div>
  );
}
