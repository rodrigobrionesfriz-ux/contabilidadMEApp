'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clp, fechaCL } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import type { CfgAsientoFin } from '@/remuneraciones/finiquito';
import { ratificarFiniquito, eliminarFiniquito, contabilizarFiniquito, propuestaFiniquito } from '../acciones';

type Propuesta = Awaited<ReturnType<typeof propuestaFiniquito>>;
interface Concepto { k: string; cd: string; nm: string; prov?: string; ayuda?: string }

export function AccionesFiniquito({ empresaId, id, escribe, ratificado, contabilizado, anulado, puedeContabilizar, fechaTermino, centros, conceptos, lineasCalc }: {
  empresaId: string; id: string; escribe: boolean; ratificado: boolean; contabilizado: { numero: number; fecha: string } | null; anulado: boolean;
  puedeContabilizar: boolean; fechaTermino: string; centros: { codigo: string; nombre: string }[]; conceptos: Concepto[];
  lineasCalc: Record<string, boolean> | null;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [cfg, setCfg] = useState<CfgAsientoFin>({ fecha: fechaTermino, cc: '', cuentas: {}, usarProv: {} });
  const [prop, setProp] = useState<Propuesta | null>(null);
  const run = (f: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>, despues?: () => void) => iniciar(async () => {
    const r = await f(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) { despues?.(); router.refresh(); }
  });
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    propuestaFiniquito(empresaId, id, cfg).then((p) => {
      if (!vivo) return;
      setProp(p);
      // La primera vez propone usar las provisiones que tengan saldo
      if (cfg.usarProv && Object.keys(cfg.usarProv).length === 0 && (p.saldos['2105004'] || p.saldos['2202001']))
        setCfg((c) => ({ ...c, usarProv: { feriado: (p.saldos['2105004'] || 0) > 0, ias: (p.saldos['2202001'] || 0) > 0 } }));
    });
    return () => { vivo = false; };
  }, [abierto, cfg, empresaId, id]);
  const visibles = conceptos.filter((c) => c.k === 'pagar' || (lineasCalc && (c.k === 'aviso' ? lineasCalc.ias : lineasCalc[c.k])));
  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap justify-center gap-2">
        <button type="button" className="boton" onClick={() => window.print()}>🖨️ Imprimir / PDF</button>
        {escribe && !contabilizado && <Link href={`/e/${empresaId}/remuneraciones/finiquitos/${id}/editar`} className="boton-sec">✏️ Editar</Link>}
        {escribe && <button type="button" className="boton-sec" disabled={pendiente} onClick={() => run(() => ratificarFiniquito(empresaId, id, !ratificado))}>{ratificado ? '↩️ Volver a borrador' : '✅ Marcar como ratificado'}</button>}
        {escribe && !contabilizado && <button type="button" className="boton-sec text-peligro" disabled={pendiente}
          onClick={() => window.confirm('¿Eliminar este finiquito? La fecha de término registrada en la ficha no se modifica.') && run(() => eliminarFiniquito(empresaId, id), () => router.push(`/e/${empresaId}/remuneraciones/finiquitos`))}>🗑 Eliminar</button>}
      </div>
      <Mensaje {...msg} />
      <section className="tarjeta mx-auto max-w-3xl space-y-3 p-4 text-sm">
        <h2 className="font-semibold">Contabilización</h2>
        {contabilizado ? <p>✅ Contabilizado en el asiento <Link className="text-acento hover:underline" href={`/e/${empresaId}/diario?anio=${contabilizado.fecha.slice(0, 4)}#n${contabilizado.numero}`}>N° {contabilizado.numero}</Link> del {fechaCL(contabilizado.fecha)}. Para rehacerlo, anula ese asiento en el libro diario.</p>
          : <p className="text-tenue">Sin contabilizar.{anulado ? ' El asiento anterior está anulado.' : ''}</p>}
        {escribe && !contabilizado && puedeContabilizar && !abierto && <button type="button" className="boton-sec" onClick={() => setAbierto(true)}>📒 Generar asiento</button>}
        {escribe && !contabilizado && !puedeContabilizar && <p className="text-xs text-amber-500">Para contabilizar, el total debe ser mayor que cero y coincidir con el cálculo vigente.</p>}
        {abierto && !contabilizado && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div><label className="etiqueta" htmlFor="fas-fecha">Fecha del asiento</label><input id="fas-fecha" type="date" value={cfg.fecha} onChange={(e) => setCfg({ ...cfg, fecha: e.target.value })} className="campo" /></div>
              <div className="sm:col-span-2"><label className="etiqueta" htmlFor="fas-cc">Centro de costo (gastos)</label>
                <select id="fas-cc" value={cfg.cc} onChange={(e) => setCfg({ ...cfg, cc: e.target.value })} className="campo"><option value="">Sin centro de costo</option>{centros.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}</select></div>
            </div>
            <table className="w-full text-xs">
              <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Concepto</th><th>Cuenta</th><th>Provisión</th></tr></thead>
              <tbody>
                {visibles.map((c) => (
                  <tr key={c.k} className="border-b border-borde/30">
                    <td className="py-1 pr-2">{c.nm}{c.ayuda && <div className="text-[10px] text-tenue">{c.ayuda}</div>}</td>
                    <td><input aria-label={`Cuenta ${c.nm}`} value={cfg.cuentas?.[c.k] ?? c.cd} onChange={(e) => setCfg({ ...cfg, cuentas: { ...cfg.cuentas, [c.k]: e.target.value.trim() } })} className="campo num w-28 py-0.5" /></td>
                    <td>{c.prov && (c.k === 'feriado' || c.k === 'ias') ? <label className="flex items-center gap-1"><input type="checkbox" checked={!!cfg.usarProv?.[c.k === 'feriado' ? 'feriado' : 'ias']} onChange={(e) => setCfg({ ...cfg, usarProv: { ...cfg.usarProv, [c.k === 'feriado' ? 'feriado' : 'ias']: e.target.checked } })} /> {c.prov}{prop ? ` (saldo ${clp(prop.saldos[c.prov] || 0)})` : ''}</label> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {prop && (
              <>
                <table className="w-full text-xs">
                  <thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Cuenta</th><th>Glosa</th><th className="text-right">Debe</th><th className="text-right">Haber</th></tr></thead>
                  <tbody>
                    {prop.movs.map((m, i) => <tr key={i} className="border-b border-borde/30"><td className="num py-1">{m.cuenta} <span className="text-tenue">{m.nombre}</span>{m.centro_costo ? <span className="text-tenue"> · {m.centro_costo}</span> : null}</td><td>{m.glosa}</td><td className="num text-right">{m.debe ? clp(m.debe) : ''}</td><td className="num text-right">{m.haber ? clp(m.haber) : ''}</td></tr>)}
                    <tr className="font-semibold"><td colSpan={2} className="py-1">Totales</td><td className="num text-right">{clp(prop.debe)}</td><td className="num text-right">{clp(prop.haber)}</td></tr>
                  </tbody>
                </table>
                {prop.avisos.map((a, i) => <p key={i} className="text-xs text-amber-500">⚠️ {a}</p>)}
                {prop.errores.map((a, i) => <p key={i} className="text-xs text-peligro">❌ {a}</p>)}
              </>
            )}
            <div className="flex gap-2">
              <button type="button" className="boton" disabled={pendiente || !prop || prop.errores.length > 0} onClick={() => run(() => contabilizarFiniquito(empresaId, id, cfg), () => setAbierto(false))}>Contabilizar</button>
              <button type="button" className="boton-sec" onClick={() => setAbierto(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
