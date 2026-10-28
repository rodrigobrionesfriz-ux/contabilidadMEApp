'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import type { TipoAuxiliar } from '@/auxiliares/saldos';
import { diasEntre } from '@/auxiliares/saldos';
import { clp, fechaCL, milesInput } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { registrarPago } from './acciones';

export interface Pendiente { clave: string; rut: string; razon: string; tipo_dte: number | null; folio: string; fecha: string; vence: string; saldo: number }

const TITULO: Record<TipoAuxiliar, string> = { proveedor: 'Pagos a proveedores', cliente: 'Cobros a clientes', honorario: 'Pagos de honorarios' };

export function Pagos({ empresaId, tipo, pendientes, cuentas, aFavor, hoy }: {
  empresaId: string; tipo: TipoAuxiliar; pendientes: Pendiente[]; cuentas: { codigo: string; nombre: string }[];
  aFavor: { rut: string; razon: string; monto: number }[]; hoy: string;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<string, number>>({});
  const [fecha, setFecha] = useState(hoy);
  const [cuenta, setCuenta] = useState(cuentas.find((c) => c.codigo === '1101201')?.codigo ?? cuentas[0]?.codigo ?? '');
  const [glosa, setGlosa] = useState('');
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? pendientes.filter((p) => `${p.razon} ${p.rut} ${p.folio}`.toLowerCase().includes(t)) : pendientes;
  }, [q, pendientes]);
  const total = Object.values(sel).reduce((a, b) => a + b, 0);
  const n = Object.keys(sel).length;
  const toggle = (p: Pendiente, on: boolean) => setSel((s) => {
    const x = { ...s };
    if (on) x[p.clave] = p.saldo; else delete x[p.clave];
    return x;
  });

  function pagar() {
    setMsg({});
    const pedidos = pendientes.filter((p) => sel[p.clave] != null).map((p) => ({ rut: p.rut, tipo_dte: p.tipo_dte, folio: p.folio, monto: sel[p.clave] }));
    iniciar(async () => {
      const r = await registrarPago(empresaId, tipo, fecha, cuenta, glosa, pedidos);
      if (!r.ok) return setMsg({ error: r.error });
      setMsg({ ok: `${tipo === 'cliente' ? 'Cobro' : 'Pago'} registrado: ${clp(r.total)} · asiento N° ${r.numero}.` });
      setSel({}); setGlosa('');
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-xl font-semibold">{TITULO[tipo]}</h1>
        <div className="flex gap-1 rounded-md border border-borde p-1 text-sm">
          {(['proveedor', 'honorario', 'cliente'] as const).map((t) => (
            <Link key={t} href={`?tipo=${t}`} className={`rounded px-3 py-1 ${tipo === t ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>
              {t === 'proveedor' ? 'Proveedores' : t === 'honorario' ? 'Honorarios' : 'Clientes'}
            </Link>
          ))}
        </div>
      </div>
      {aFavor.length > 0 && (
        <p className="rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">
          Saldo a favor: {aFavor.slice(0, 3).map((a) => `${a.razon || a.rut} ${clp(a.monto)}`).join(' · ')}{aFavor.length > 3 ? ` y ${aFavor.length - 3} más` : ''}. Revisa en Auxiliares antes de pagar.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, RUT o folio" className="campo w-72" />
        <span className="text-sm text-tenue">{visibles.length} documentos con saldo · {clp(visibles.reduce((a, p) => a + p.saldo, 0))}</span>
      </div>
      {pendientes.length === 0 ? (
        <div className="tarjeta p-8 text-center text-tenue">No hay documentos con saldo pendiente.</div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="text-left text-tenue uppercase">
              <tr className="border-b border-borde">
                <th className="w-8 px-2 py-2">
                  <input type="checkbox" aria-label="Seleccionar visibles" checked={visibles.length > 0 && visibles.every((p) => sel[p.clave] != null)}
                    onChange={(e) => visibles.forEach((p) => toggle(p, e.target.checked))} />
                </th>
                <th className="px-2 py-2">Documento</th><th className="px-2 py-2">{tipo === 'cliente' ? 'Cliente' : tipo === 'honorario' ? 'Prestador' : 'Proveedor'}</th>
                <th className="px-2 py-2">Emisión</th><th className="px-2 py-2">Vencimiento</th>
                <th className="px-2 py-2 text-right">Saldo</th><th className="w-40 px-2 py-2 text-right">A {tipo === 'cliente' ? 'cobrar' : 'pagar'}</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => {
                const dias = diasEntre(p.vence, hoy);
                const marcado = sel[p.clave] != null;
                return (
                  <tr key={p.clave} className={`border-b border-borde/40 ${marcado ? 'bg-panel-2' : ''}`}>
                    <td className="px-2 py-1.5"><input type="checkbox" checked={marcado} onChange={(e) => toggle(p, e.target.checked)} aria-label={`Seleccionar ${p.folio}`} /></td>
                    <td className="num px-2 py-1.5">{p.tipo_dte} N° {p.folio}</td>
                    <td className="max-w-[260px] px-2 py-1.5"><div className="truncate">{p.razon}</div><div className="num text-tenue">{p.rut}</div></td>
                    <td className="num px-2 py-1.5">{fechaCL(p.fecha)}</td>
                    <td className={`num px-2 py-1.5 ${dias > 0 ? 'text-aviso' : ''}`}>{fechaCL(p.vence)}{dias > 0 ? ` · ${dias}d` : ''}</td>
                    <td className="num px-2 py-1.5 text-right">{clp(p.saldo)}</td>
                    <td className="px-2 py-1.5">
                      {marcado && (
                        <input inputMode="numeric" value={sel[p.clave] ? milesInput(sel[p.clave]) : ''} aria-label={`Monto ${p.folio}`}
                          onChange={(e) => setSel((s) => ({ ...s, [p.clave]: Math.min(p.saldo, Math.round(Number(e.target.value.replace(/\./g, '')) || 0)) }))}
                          className="campo num py-1 text-right" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <section className="tarjeta grid gap-3 p-4 sm:grid-cols-[160px_1fr_1fr_auto] sm:items-end">
        <div><label className="etiqueta" htmlFor="fecha">Fecha</label><input id="fecha" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" /></div>
        <div>
          <label className="etiqueta" htmlFor="cuenta">{tipo === 'cliente' ? 'Depositado en' : 'Pagado desde'}</label>
          <select id="cuenta" value={cuenta} onChange={(e) => setCuenta(e.target.value)} className="campo">
            {cuentas.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
          </select>
        </div>
        <div><label className="etiqueta" htmlFor="glosa">Glosa (opcional)</label><input id="glosa" value={glosa} onChange={(e) => setGlosa(e.target.value)} className="campo" placeholder="Ej: Transferencia N° 1234" /></div>
        <button type="button" className="boton" disabled={!n || !total || !cuenta || pendiente} onClick={pagar}>
          {pendiente ? 'Registrando…' : `${tipo === 'cliente' ? 'Cobrar' : 'Pagar'} ${n} · ${clp(total)}`}
        </button>
      </section>
      <Mensaje {...msg} />
    </div>
  );
}
