'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { clp, fechaCL, MESES } from '@/lib/formato';
import { PestanasPagos } from './pestanas';

export interface FilaHistorial {
  id: string; numero: number; fecha: string; glosa: string; anulado: boolean;
  tipo: 'proveedor' | 'cliente' | 'honorario' | 'tarjetas'; nombres: string[]; ruts: string[]; folios: string[]; cuenta: string; monto: number;
}
const TIPO: Record<FilaHistorial['tipo'], { lbl: string; ic: string; cls: string }> = {
  proveedor: { lbl: 'Pago proveedor', ic: '🏭', cls: 'bg-aviso/15 text-aviso' },
  cliente: { lbl: 'Cobro cliente', ic: '📇', cls: 'bg-info/15 text-info' },
  honorario: { lbl: 'Pago honorarios', ic: '📝', cls: 'bg-acento/15 text-acento' },
  tarjetas: { lbl: 'Abono tarjetas', ic: '💳', cls: 'bg-acento/15 text-acento' },
};

/** Historial de pagos y cobros: cada fila abre el asiento para revisarlo y editarlo. */
export function HistorialPagos({ empresaId, anio, filas }: { empresaId: string; anio: number; filas: FilaHistorial[] }) {
  const [tipo, setTipo] = useState('');
  const [mes, setMes] = useState('');
  const [q, setQ] = useState('');
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase(), dig = t.replace(/[^0-9]/g, '');
    return filas.filter((f) => {
      if (tipo && f.tipo !== tipo) return false;
      if (mes && Number(f.fecha.slice(5, 7)) !== Number(mes)) return false;
      if (!t) return true;
      if ([f.glosa, ...f.nombres, ...f.ruts, ...f.folios].join(' ').toLowerCase().includes(t)) return true;
      return !!dig && (String(f.numero) === dig || String(Math.round(f.monto)).startsWith(dig));
    });
  }, [filas, tipo, mes, q]);
  const total = visibles.filter((f) => !f.anulado).reduce((s, f) => s + f.monto, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">Historial de pagos y cobros · {anio}</h1>
        <PestanasPagos actual="historial" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="campo w-56" aria-label="Tipo">
          <option value="">Pagos y cobros</option><option value="proveedor">🏭 Pagos a proveedores</option>
          <option value="cliente">📇 Cobros a clientes</option><option value="honorario">📝 Pagos de honorarios</option><option value="tarjetas">💳 Abonos de tarjetas</option>
        </select>
        <select value={mes} onChange={(e) => setMes(e.target.value)} className="campo w-44" aria-label="Mes">
          <option value="">Todos los meses</option>{MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por N°, RUT, nombre, folio, glosa o monto" className="campo min-w-0 flex-1 sm:max-w-md" />
        <span className="text-sm text-tenue">{visibles.length} comprobantes · {clp(total)}</span>
      </div>
      {visibles.length === 0 ? (
        <div className="tarjeta p-8 text-center text-tenue">No hay pagos ni cobros que coincidan.</div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[860px] text-xs">
            <thead className="text-left text-tenue uppercase">
              <tr className="border-b border-borde">
                <th className="px-3 py-2">N°</th><th className="px-2 py-2">Fecha</th><th className="px-2 py-2">Tipo</th><th className="px-2 py-2">Proveedor / cliente</th>
                <th className="px-2 py-2">Documentos</th><th className="px-2 py-2">Cuenta</th><th className="px-2 py-2 text-right">Monto</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((f) => {
                const href = `/e/${empresaId}/asientos/${f.id}${f.anulado ? '' : '/editar'}`;
                return (
                  <tr key={f.id} className={`border-b border-borde/40 hover:bg-panel-2 ${f.anulado ? 'line-through opacity-50' : ''}`}>
                    <td className="px-3 py-1.5"><Link href={href} className="num font-semibold hover:text-acento">{f.numero}</Link></td>
                    <td className="num px-2 py-1.5"><Link href={href} className="block">{fechaCL(f.fecha)}</Link></td>
                    <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap ${TIPO[f.tipo].cls}`}>{TIPO[f.tipo].ic} {TIPO[f.tipo].lbl}</span></td>
                    <td className="max-w-[260px] px-2 py-1.5"><Link href={href} className="block truncate hover:text-acento" title={f.nombres.join(', ') || f.glosa}>
                      {f.nombres[0] || <span className="text-tenue">{f.glosa}</span>}{f.nombres.length > 1 && <span className="text-tenue"> +{f.nombres.length - 1}</span>}</Link></td>
                    <td className="num px-2 py-1.5 text-tenue">{f.folios.length ? `N° ${f.folios.slice(0, 4).join(', ')}${f.folios.length > 4 ? ' …' : ''}` : ''}</td>
                    <td className="px-2 py-1.5 text-tenue">{f.cuenta}</td>
                    <td className="num px-2 py-1.5 text-right font-semibold">{clp(f.monto)}</td>
                    <td className="px-3 py-1.5 text-right">{f.anulado
                      ? <span className="rounded bg-peligro/20 px-1.5 py-0.5 text-[10px] font-semibold text-peligro no-underline">ANULADO</span>
                      : <Link href={href} className="text-tenue hover:text-acento">✏️ Editar</Link>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-tenue">Al abrir un comprobante se muestra su asiento contable para corregirlo (fecha, glosa, cuentas, montos, RUT y folio de cada línea). El N° del comprobante se mantiene y el cambio queda en el registro de actividad.</p>
    </div>
  );
}
