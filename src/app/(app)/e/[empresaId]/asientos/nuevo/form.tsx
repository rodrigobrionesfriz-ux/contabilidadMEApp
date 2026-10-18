'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { guardarAsiento } from '../acciones';
import { clp, hoyISO } from '@/lib/formato';
import { rutParse } from '@/motor/rut';
import { Mensaje } from '@/components/form-estado';

export interface CuentaOpcion {
  codigo: string;
  nombre: string;
  tipo_auxiliar: string | null;
  acepta_centro_costo: boolean;
  requiere_centro_costo: boolean;
}

interface Linea { cuenta: string; debe: string; haber: string; cc: string; rut: string; glosa: string }
const vacia = (): Linea => ({ cuenta: '', debe: '', haber: '', cc: '', rut: '', glosa: '' });
const monto = (s: string) => Math.round(Number(s.replace(/\./g, '').replace(',', '.')) || 0);

export function FormAsiento({ empresaId, cuentas, centros }: {
  empresaId: string; cuentas: CuentaOpcion[]; centros: { codigo: string; nombre: string }[];
}) {
  const porCodigo = useMemo(() => new Map(cuentas.map((c) => [c.codigo, c])), [cuentas]);
  const [fecha, setFecha] = useState(hoyISO());
  const [glosa, setGlosa] = useState('');
  const [lineas, setLineas] = useState<Linea[]>([vacia(), vacia()]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [enviando, iniciar] = useTransition();

  const cambiar = (i: number, campo: keyof Linea, v: string) =>
    setLineas((ls) => ls.map((l, j) => {
      if (j !== i) return l;
      const n = { ...l, [campo]: v };
      if (campo === 'cuenta') n.cuenta = v.split(' ')[0]; // acepta "1101201 · Banco" desde la lista
      if (campo === 'debe' && v) n.haber = '';
      if (campo === 'haber' && v) n.debe = '';
      return n;
    }));

  const totalD = lineas.reduce((s, l) => s + monto(l.debe), 0);
  const totalH = lineas.reduce((s, l) => s + monto(l.haber), 0);
  const cuadra = totalD > 0 && totalD === totalH;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setMsg({});
    const usadas = lineas.filter((l) => l.cuenta || l.debe || l.haber);
    for (const [i, l] of usadas.entries()) {
      if (!porCodigo.has(l.cuenta)) return setMsg({ error: `Línea ${i + 1}: la cuenta ${l.cuenta || '(vacía)'} no existe o no es imputable` });
      if (l.rut && !rutParse(l.rut).valido) return setMsg({ error: `Línea ${i + 1}: RUT no válido` });
    }
    if (!cuadra) return setMsg({ error: `El asiento no cuadra (diferencia ${clp(totalD - totalH)})` });
    iniciar(async () => {
      const r = await guardarAsiento({
        empresaId, fecha, glosa,
        lineas: usadas.map((l) => ({
          cuenta: l.cuenta, debe: monto(l.debe), haber: monto(l.haber),
          glosa: l.glosa || undefined, centro_costo: l.cc || undefined, rut_auxiliar: l.rut || undefined,
        })),
      });
      if (!r.ok) return setMsg({ error: r.error });
      setMsg({ ok: `Asiento N° ${r.numero} registrado.` });
      setGlosa('');
      setLineas([vacia(), vacia()]);
    });
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <datalist id="lista-cuentas">
        {cuentas.map((c) => <option key={c.codigo} value={`${c.codigo} · ${c.nombre}`} />)}
      </datalist>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div>
          <label className="etiqueta" htmlFor="fecha">Fecha</label>
          <input id="fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" />
        </div>
        <div>
          <label className="etiqueta" htmlFor="glosa">Glosa</label>
          <input id="glosa" required value={glosa} onChange={(e) => setGlosa(e.target.value)} className="campo" />
        </div>
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="text-left text-xs text-tenue uppercase">
            <tr className="border-b border-borde">
              <th className="px-2 py-2">Cuenta</th><th className="px-2 py-2 w-36">Debe</th><th className="px-2 py-2 w-36">Haber</th>
              <th className="px-2 py-2">Detalle</th><th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const c = porCodigo.get(l.cuenta);
              return (
                <tr key={i} className="border-b border-borde/50 align-top">
                  <td className="px-2 py-1.5">
                    <input list="lista-cuentas" value={l.cuenta} onChange={(e) => cambiar(i, 'cuenta', e.target.value)}
                      placeholder="Código o nombre" className="campo num" aria-label={`Cuenta línea ${i + 1}`} />
                    <div className="mt-0.5 truncate text-xs text-tenue">{c?.nombre ?? (l.cuenta ? '⚠️ cuenta no encontrada' : '')}</div>
                  </td>
                  <td className="px-2 py-1.5"><input inputMode="numeric" value={l.debe} onChange={(e) => cambiar(i, 'debe', e.target.value)} className="campo num text-right" aria-label={`Debe línea ${i + 1}`} /></td>
                  <td className="px-2 py-1.5"><input inputMode="numeric" value={l.haber} onChange={(e) => cambiar(i, 'haber', e.target.value)} className="campo num text-right" aria-label={`Haber línea ${i + 1}`} /></td>
                  <td className="space-y-1 px-2 py-1.5">
                    {c?.tipo_auxiliar && (
                      <input value={l.rut} onChange={(e) => cambiar(i, 'rut', e.target.value)} placeholder={`RUT ${c.tipo_auxiliar} *`} className="campo num" />
                    )}
                    {c?.acepta_centro_costo && (
                      <select value={l.cc} onChange={(e) => cambiar(i, 'cc', e.target.value)} className="campo">
                        <option value="">{c.requiere_centro_costo ? 'Centro de costo *' : 'Sin centro de costo'}</option>
                        {centros.map((cc) => <option key={cc.codigo} value={cc.codigo}>{cc.codigo} · {cc.nombre}</option>)}
                      </select>
                    )}
                    <input value={l.glosa} onChange={(e) => cambiar(i, 'glosa', e.target.value)} placeholder="Glosa de la línea (opcional)" className="campo" />
                  </td>
                  <td className="px-1 py-1.5">
                    {lineas.length > 2 && (
                      <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="text-tenue hover:text-peligro" aria-label="Quitar línea">✕</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-2 py-2">
                <button type="button" onClick={() => setLineas((ls) => [...ls, vacia()])} className="boton-sec">+ Línea</button>
              </td>
              <td className="num px-2 py-2 text-right">{clp(totalD)}</td>
              <td className="num px-2 py-2 text-right">{clp(totalH)}</td>
              <td colSpan={2} className={`px-2 py-2 ${cuadra ? 'text-acento' : 'text-aviso'}`}>
                {cuadra ? '✓ Cuadrado' : `Diferencia ${clp(totalD - totalH)}`}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <Mensaje {...msg} />
      <div className="flex gap-2">
        <button type="submit" className="boton" disabled={enviando || !cuadra}>{enviando ? 'Guardando…' : 'Guardar asiento'}</button>
        <Link href={`/e/${empresaId}/diario`} className="boton-sec">Ver libro diario</Link>
      </div>
    </form>
  );
}
