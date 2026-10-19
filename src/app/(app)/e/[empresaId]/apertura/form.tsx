'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { clp } from '@/lib/formato';
import { rutParse } from '@/motor/rut';
import { leerPegado, montoCL, totales, lineaDiferencia } from '@/motor/apertura';
import { Mensaje } from '@/components/form-estado';
import { guardarApertura } from './acciones';
import { generarApertura } from '../cierre/acciones';

export interface CuentaApertura { codigo: string; nombre: string; tipo_auxiliar: string | null }
export interface LineaInicial { cuenta: string; debe: number; haber: number; rut: string; dte: string; folio: string; glosa: string }

interface Linea { cuenta: string; debe: string; haber: string; rut: string; dte: string; folio: string; glosa: string }
const vacia = (): Linea => ({ cuenta: '', debe: '', haber: '', rut: '', dte: '', folio: '', glosa: '' });
const fmt = (n: number) => (n ? n.toLocaleString('es-CL') : '');
const aTexto = (l: LineaInicial): Linea => ({ ...l, debe: fmt(l.debe), haber: fmt(l.haber) });
const m = (s: string) => Math.max(0, montoCL(s) ?? 0);

export function FormApertura({ empresaId, anio, cuentas, iniciales, glosaInicial, existe, puedeGenerar, escribe }: {
  empresaId: string; anio: number; cuentas: CuentaApertura[]; iniciales: LineaInicial[]; glosaInicial: string;
  existe: boolean; puedeGenerar: boolean; escribe: boolean;
}) {
  const router = useRouter();
  const porCodigo = useMemo(() => new Map(cuentas.map((c) => [c.codigo, c])), [cuentas]);
  const patrimonio = cuentas.filter((c) => c.codigo.startsWith('23'));
  const [glosa, setGlosa] = useState(glosaInicial);
  const [lineas, setLineas] = useState<Linea[]>(iniciales.length ? iniciales.map(aTexto) : [vacia(), vacia()]);
  const [pegar, setPegar] = useState<string | null>(null);
  const [ctaDif, setCtaDif] = useState(patrimonio.find((c) => c.codigo === '2303001')?.codigo ?? patrimonio[0]?.codigo ?? '');
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();

  const cambiar = (i: number, campo: keyof Linea, v: string) => setLineas((ls) => ls.map((l, j) => {
    if (j !== i) return l;
    const n = { ...l, [campo]: v };
    if (campo === 'cuenta') n.cuenta = v.split(' ')[0];
    if (campo === 'debe' && v) n.haber = '';
    if (campo === 'haber' && v) n.debe = '';
    return n;
  }));
  const usadas = lineas.filter((l) => l.cuenta || l.debe || l.haber);
  const t = totales(usadas.map((l) => ({ debe: m(l.debe), haber: m(l.haber) })));
  const activo = usadas.filter((l) => l.cuenta.startsWith('1')).reduce((s, l) => s + m(l.debe) - m(l.haber), 0);
  const pasivoPat = usadas.filter((l) => l.cuenta.startsWith('2')).reduce((s, l) => s + m(l.haber) - m(l.debe), 0);

  function aplicarPegado(modo: 'reemplazar' | 'agregar') {
    const r = leerPegado(pegar ?? '');
    if (!r.lineas.length) return setMsg({ error: 'No encontré filas con cuenta y monto. Copia desde Excel las columnas cuenta, debe y haber (o cuenta y saldo).' });
    const nuevas = r.lineas.map((l) => aTexto({ cuenta: l.cuenta, debe: l.debe, haber: l.haber, rut: l.rut ?? '', dte: l.dte ?? '', folio: l.folio ?? '', glosa: l.glosa ?? '' }));
    setLineas(modo === 'reemplazar' ? nuevas : [...usadas, ...nuevas]);
    setPegar(null);
    const fuera = r.lineas.filter((l) => !porCodigo.has(l.cuenta)).length;
    setMsg({ ok: `${r.lineas.length} líneas leídas${r.omitidas ? ` (${r.omitidas} filas omitidas: encabezados, totales o en cero)` : ''}.`
      + (fuera ? ` Ojo: ${fuera} usan cuentas que no son de balance o no existen; corrígelas antes de guardar.` : '') });
  }

  function saldarDiferencia() {
    const l = lineaDiferencia(usadas.map((x) => ({ debe: m(x.debe), haber: m(x.haber) })), ctaDif);
    if (l) setLineas([...usadas, aTexto({ cuenta: l.cuenta, debe: l.debe, haber: l.haber, rut: '', dte: '', folio: '', glosa: l.glosa ?? '' })]);
  }

  function guardar() {
    setMsg({});
    for (const [i, l] of usadas.entries()) {
      const c = porCodigo.get(l.cuenta);
      if (!c) return setMsg({ error: `Línea ${i + 1}: la cuenta ${l.cuenta || '(vacía)'} no es una cuenta de balance imputable` });
      if (!m(l.debe) && !m(l.haber)) return setMsg({ error: `Línea ${i + 1}: falta el monto` });
      if (c.tipo_auxiliar && !l.rut) return setMsg({ error: `Línea ${i + 1}: la cuenta ${c.codigo} requiere el RUT del ${c.tipo_auxiliar}` });
      if (l.rut && !rutParse(l.rut).valido) return setMsg({ error: `Línea ${i + 1}: RUT no válido` });
    }
    if (!t.cuadra) return setMsg({ error: `La apertura no cuadra (diferencia ${clp(t.diferencia)}). Usa "Saldar diferencia" si corresponde a patrimonio.` });
    if (existe && !window.confirm(`Se reemplazarán las líneas de la apertura ${anio}. La versión anterior queda en el registro de actividad. ¿Continuar?`)) return;
    iniciar(async () => {
      const r = await guardarApertura({
        empresaId, anio, glosa,
        lineas: usadas.map((l) => ({ cuenta: l.cuenta, debe: m(l.debe), haber: m(l.haber), rut_auxiliar: l.rut || undefined, tipo_dte: l.dte || undefined, folio: l.folio || undefined, glosa: l.glosa || undefined })),
      });
      setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
      if (r.ok) router.refresh();
    });
  }

  function generar() {
    iniciar(async () => {
      const r = await generarApertura(empresaId, anio);
      setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <datalist id="cuentas-balance">{cuentas.map((c) => <option key={c.codigo} value={`${c.codigo} · ${c.nombre}`} />)}</datalist>

      {escribe && (
        <div className="flex flex-wrap items-end gap-2">
          {puedeGenerar && <button type="button" className="boton" disabled={pendiente} onClick={generar}>Generar desde el cierre de {anio - 1}</button>}
          <button type="button" className="boton-sec" onClick={() => setPegar(pegar === null ? '' : null)}>📋 Pegar desde Excel</button>
          <div className="min-w-64 flex-1"><label className="etiqueta" htmlFor="glosa">Glosa</label>
            <input id="glosa" value={glosa} onChange={(e) => setGlosa(e.target.value)} className="campo" /></div>
        </div>
      )}

      {pegar !== null && (
        <div className="tarjeta space-y-2 p-4">
          <p className="text-xs text-tenue">Copia desde Excel y pega aquí. Columnas: <b>cuenta, debe, haber</b> y, para clientes, proveedores u honorarios, <b>RUT, tipo de documento y folio</b>. También sirve <b>cuenta y saldo</b> (negativo o entre paréntesis = haber). Puede incluir una columna con el nombre de la cuenta; los encabezados y totales se omiten.</p>
          <textarea value={pegar} onChange={(e) => setPegar(e.target.value)} rows={8} className="campo num text-xs" placeholder={'1101201\tBANCO ESTADO\t5.000.000\t\n2301001\tCAPITAL SOCIAL\t\t5.000.000'} aria-label="Datos pegados" />
          <div className="flex gap-2">
            <button type="button" className="boton" disabled={!pegar.trim()} onClick={() => aplicarPegado('reemplazar')}>Reemplazar líneas</button>
            <button type="button" className="boton-sec" disabled={!pegar.trim()} onClick={() => aplicarPegado('agregar')}>Agregar a las líneas</button>
            <button type="button" className="boton-sec" onClick={() => setPegar(null)}>Cancelar</button>
          </div>
        </div>
      )}

      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-tenue uppercase">
            <tr className="border-b border-borde">
              <th className="px-2 py-2">Cuenta</th><th className="w-36 px-2 py-2">Debe</th><th className="w-36 px-2 py-2">Haber</th>
              <th className="px-2 py-2">Auxiliar (RUT · tipo · folio)</th><th className="px-2 py-2">Glosa</th><th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const c = porCodigo.get(l.cuenta);
              return (
                <tr key={i} className="border-b border-borde/50 align-top">
                  <td className="px-2 py-1.5">
                    <input list="cuentas-balance" value={l.cuenta} disabled={!escribe} onChange={(e) => cambiar(i, 'cuenta', e.target.value)}
                      placeholder="Código o nombre" className="campo num" aria-label={`Cuenta línea ${i + 1}`} />
                    <div className="mt-0.5 truncate text-xs text-tenue">{c?.nombre ?? (l.cuenta ? '⚠️ no es una cuenta de balance imputable' : '')}</div>
                  </td>
                  <td className="px-2 py-1.5"><input inputMode="numeric" value={l.debe} disabled={!escribe} onChange={(e) => cambiar(i, 'debe', e.target.value)} className="campo num text-right" aria-label={`Debe línea ${i + 1}`} /></td>
                  <td className="px-2 py-1.5"><input inputMode="numeric" value={l.haber} disabled={!escribe} onChange={(e) => cambiar(i, 'haber', e.target.value)} className="campo num text-right" aria-label={`Haber línea ${i + 1}`} /></td>
                  <td className="px-2 py-1.5">
                    {c?.tipo_auxiliar || l.rut ? (
                      <div className="grid grid-cols-[1fr_56px_80px] gap-1">
                        <input value={l.rut} disabled={!escribe} onChange={(e) => cambiar(i, 'rut', e.target.value)} placeholder={`RUT ${c?.tipo_auxiliar ?? ''} *`} className="campo num" aria-label={`RUT línea ${i + 1}`} />
                        <input value={l.dte} disabled={!escribe} onChange={(e) => cambiar(i, 'dte', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Tipo" className="campo num" aria-label={`Tipo de documento línea ${i + 1}`} />
                        <input value={l.folio} disabled={!escribe} onChange={(e) => cambiar(i, 'folio', e.target.value)} placeholder="Folio" className="campo num" aria-label={`Folio línea ${i + 1}`} />
                      </div>
                    ) : <span className="text-xs text-tenue">—</span>}
                  </td>
                  <td className="px-2 py-1.5"><input value={l.glosa} disabled={!escribe} onChange={(e) => cambiar(i, 'glosa', e.target.value)} placeholder="Saldo inicial" className="campo" aria-label={`Glosa línea ${i + 1}`} /></td>
                  <td className="px-1 py-1.5">
                    {escribe && lineas.length > 2 && <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="text-tenue hover:text-peligro" aria-label="Quitar línea">✕</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-2 py-2">{escribe && <button type="button" onClick={() => setLineas((ls) => [...ls, vacia()])} className="boton-sec">+ Línea</button>}</td>
              <td className="num px-2 py-2 text-right">{clp(t.debe)}</td>
              <td className="num px-2 py-2 text-right">{clp(t.haber)}</td>
              <td colSpan={3} className={`px-2 py-2 ${t.cuadra ? 'text-acento' : 'text-aviso'}`}>{t.cuadra ? '✓ Cuadrado' : `Diferencia ${clp(t.diferencia)}`}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="tarjeta p-3"><div className="etiqueta">Total activo</div><div className="num text-lg font-semibold">{clp(activo)}</div></div>
        <div className="tarjeta p-3"><div className="etiqueta">Pasivo + patrimonio</div><div className="num text-lg font-semibold">{clp(pasivoPat)}</div></div>
        <div className="tarjeta p-3"><div className="etiqueta">Líneas</div><div className="num text-lg font-semibold">{usadas.length}</div></div>
      </div>

      {escribe && !t.cuadra && t.diferencia !== 0 && patrimonio.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <div className="w-80"><label className="etiqueta" htmlFor="ctadif">Saldar la diferencia ({clp(t.diferencia)}) contra</label>
            <select id="ctadif" value={ctaDif} onChange={(e) => setCtaDif(e.target.value)} className="campo">
              {patrimonio.map((c) => <option key={c.codigo} value={c.codigo}>{c.codigo} · {c.nombre}</option>)}
            </select></div>
          <button type="button" className="boton-sec" onClick={saldarDiferencia}>Saldar diferencia</button>
        </div>
      )}

      <Mensaje {...msg} />
      {escribe && (
        <button type="button" className="boton" disabled={pendiente || !t.cuadra} onClick={guardar}>
          {pendiente ? 'Guardando…' : existe ? 'Guardar cambios en la apertura' : 'Registrar apertura'}
        </button>
      )}
    </div>
  );
}
