'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clp, milesInput, ANCHO_MONTO } from '@/lib/formato';
import { rutParse } from '@/motor/rut';
import { advertenciasDocumento, cambiaronMontos, type DocumentoAsiento } from '@/motor/edicion';
import { Mensaje } from '@/components/form-estado';
import { editarAsiento } from '../../acciones';

export interface CuentaEdicion { codigo: string; nombre: string; tipo_auxiliar: string | null; acepta_centro_costo: boolean; requiere_centro_costo: boolean }
export interface LineaInicial { cuenta: string; debe: number; haber: number; glosa: string; cc: string; rut: string; dte: string; folio: string }

interface Linea { cuenta: string; debe: string; haber: string; glosa: string; cc: string; rut: string; dte: string; folio: string }
const vacia = (): Linea => ({ cuenta: '', debe: '', haber: '', glosa: '', cc: '', rut: '', dte: '', folio: '' });
const m = (s: string) => Math.max(0, Math.round(Number(s.replace(/\./g, '')) || 0));

export function EditorAsiento({ empresaId, id, numero, anio, fechaInicial, glosaInicial, iniciales, cuentas, centros, documentos, mesesCerrados }: {
  empresaId: string; id: string; numero: number; anio: number; fechaInicial: string; glosaInicial: string; iniciales: LineaInicial[];
  cuentas: CuentaEdicion[]; centros: { codigo: string; nombre: string }[]; documentos: DocumentoAsiento[]; mesesCerrados: string[];
}) {
  const router = useRouter();
  const porCodigo = useMemo(() => new Map(cuentas.map((c) => [c.codigo, c])), [cuentas]);
  const [fecha, setFecha] = useState(fechaInicial);
  const [glosa, setGlosa] = useState(glosaInicial);
  const [motivo, setMotivo] = useState('');
  const [lineas, setLineas] = useState<Linea[]>(iniciales.length
    ? iniciales.map((l) => ({ ...l, debe: milesInput(l.debe || ''), haber: milesInput(l.haber || '') })) : [vacia(), vacia()]);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();

  const cambiar = (i: number, campo: keyof Linea, v: string) => setLineas((ls) => ls.map((l, j) => {
    if (j !== i) return l;
    const n = { ...l, [campo]: campo === 'debe' || campo === 'haber' ? milesInput(v, 10).replace('-', '') : v };
    if (campo === 'cuenta') n.cuenta = v.split(' ')[0];
    if (campo === 'debe' && v) n.haber = '';
    if (campo === 'haber' && v) n.debe = '';
    return n;
  }));

  const usadas = lineas.filter((l) => l.cuenta || l.debe || l.haber);
  const nums = usadas.map((l) => ({ cuenta: l.cuenta, debe: m(l.debe), haber: m(l.haber), rut: l.rut }));
  const totalD = nums.reduce((s, l) => s + l.debe, 0), totalH = nums.reduce((s, l) => s + l.haber, 0);
  const cuadra = totalD > 0 && totalD === totalH;
  const montosCambiados = cambiaronMontos(iniciales.map((l) => ({ cuenta: l.cuenta, debe: l.debe, haber: l.haber })), nums);
  const advertencias = documentos.flatMap((d) => advertenciasDocumento(d, nums));
  const desdeRCV = documentos.some((d) => (d.origen ?? '').toUpperCase() === 'RCV');
  const doc0 = documentos[0];
  const periodoCerrado = mesesCerrados.includes(fecha.slice(0, 7));

  function guardar() {
    setMsg({});
    for (const [i, l] of usadas.entries()) {
      const c = porCodigo.get(l.cuenta);
      if (!c) return setMsg({ error: `Línea ${i + 1}: la cuenta ${l.cuenta || '(vacía)'} no existe o no es imputable` });
      if (!m(l.debe) && !m(l.haber)) return setMsg({ error: `Línea ${i + 1}: falta el monto` });
      if (c.tipo_auxiliar && !l.rut) return setMsg({ error: `Línea ${i + 1}: la cuenta ${c.codigo} requiere el RUT del ${c.tipo_auxiliar}` });
      if (l.rut && !rutParse(l.rut).valido) return setMsg({ error: `Línea ${i + 1}: RUT no válido` });
      if (c.requiere_centro_costo && !l.cc) return setMsg({ error: `Línea ${i + 1}: la cuenta ${c.codigo} exige centro de costo` });
    }
    if (!fecha.startsWith(String(anio))) return setMsg({ error: `La fecha debe quedar en ${anio}: el número del comprobante es correlativo por año.` });
    if (periodoCerrado) return setMsg({ error: `El período ${fecha.slice(0, 7)} está cerrado.` });
    if (!cuadra) return setMsg({ error: `El asiento no cuadra (diferencia ${clp(totalD - totalH)})` });
    if (advertencias.length && !window.confirm(`⚠️ ${desdeRCV ? 'Este comprobante se capturó desde el RCV' : 'Este comprobante tiene un documento asociado'} y los montos ya no coinciden:\n\n• ${advertencias.join('\n• ')}\n\nEl documento no se modifica. ¿Guardar igual?`)) return;
    iniciar(async () => {
      const r = await editarAsiento({
        empresaId, id, fecha, glosa, motivo: motivo || undefined,
        lineas: usadas.map((l) => ({ cuenta: l.cuenta, debe: m(l.debe), haber: m(l.haber), glosa: l.glosa || undefined,
          centro_costo: l.cc || undefined, rut_auxiliar: l.rut || undefined, tipo_dte: l.dte || undefined, folio: l.folio || undefined })),
      });
      if (!r.ok) return setMsg({ error: r.error });
      router.push(`/e/${empresaId}/asientos/${id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <datalist id="lista-cuentas-edicion">{cuentas.map((c) => <option key={c.codigo} value={`${c.codigo} · ${c.nombre}`} />)}</datalist>

      {doc0 && (
        <p className="rounded-md border border-borde bg-panel-2 px-3 py-2 text-xs">
          {desdeRCV ? '📥 Capturado desde el RCV' : '📄 Con documento asociado'}: {doc0.tipo} · DTE {doc0.tipo_dte} N° {doc0.folio} · RUT {doc0.rut} · IVA {clp(doc0.iva ?? 0)} · total {clp(doc0.total ?? 0)}.
          {' '}Puedes cambiar glosas, detalle, cuentas y centros de costo; si cambias montos, el documento no se modifica.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div><label className="etiqueta" htmlFor="fecha">Fecha</label>
          <input id="fecha" type="date" min={`${anio}-01-01`} max={`${anio}-12-31`} value={fecha} onChange={(e) => setFecha(e.target.value)} className="campo" /></div>
        <div><label className="etiqueta" htmlFor="glosa">Glosa</label>
          <input id="glosa" value={glosa} onChange={(e) => setGlosa(e.target.value)} className="campo" /></div>
      </div>

      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-tenue uppercase">
            <tr className="border-b border-borde">
              <th className="px-2 py-2">Cuenta</th>
              <th className={`px-2 py-2 text-right ${ANCHO_MONTO}`}>Debe</th><th className={`px-2 py-2 text-right ${ANCHO_MONTO}`}>Haber</th>
              <th className="px-2 py-2">Detalle</th><th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const c = porCodigo.get(l.cuenta);
              return (
                <tr key={i} className="border-b border-borde/50 align-top">
                  <td className="px-2 py-1.5">
                    <input list="lista-cuentas-edicion" value={l.cuenta} onChange={(e) => cambiar(i, 'cuenta', e.target.value)} placeholder="Código o nombre" className="campo num" aria-label={`Cuenta línea ${i + 1}`} />
                    <div className="mt-0.5 truncate text-xs text-tenue">{c?.nombre ?? (l.cuenta ? '⚠️ cuenta no encontrada' : '')}</div>
                  </td>
                  <td className="px-2 py-1.5"><input inputMode="numeric" maxLength={13} value={l.debe} onChange={(e) => cambiar(i, 'debe', e.target.value)} className={`campo num text-right ${ANCHO_MONTO}`} aria-label={`Debe línea ${i + 1}`} /></td>
                  <td className="px-2 py-1.5"><input inputMode="numeric" maxLength={13} value={l.haber} onChange={(e) => cambiar(i, 'haber', e.target.value)} className={`campo num text-right ${ANCHO_MONTO}`} aria-label={`Haber línea ${i + 1}`} /></td>
                  <td className="space-y-1 px-2 py-1.5">
                    <input value={l.glosa} onChange={(e) => cambiar(i, 'glosa', e.target.value)} placeholder="Detalle de la línea" className="campo" aria-label={`Detalle línea ${i + 1}`} />
                    {(c?.tipo_auxiliar || l.rut) && (
                      <div className="grid grid-cols-[1fr_64px_96px] gap-1">
                        <input value={l.rut} onChange={(e) => cambiar(i, 'rut', e.target.value)} placeholder={`RUT ${c?.tipo_auxiliar ?? ''}${c?.tipo_auxiliar ? ' *' : ''}`} className="campo num" aria-label={`RUT línea ${i + 1}`} />
                        <input value={l.dte} onChange={(e) => cambiar(i, 'dte', e.target.value.replace(/[^0-9]/g, ''))} placeholder="Tipo" className="campo num" aria-label={`Tipo documento línea ${i + 1}`} />
                        <input value={l.folio} onChange={(e) => cambiar(i, 'folio', e.target.value)} placeholder="Folio" className="campo num" aria-label={`Folio línea ${i + 1}`} />
                      </div>
                    )}
                    {(c?.acepta_centro_costo || l.cc) && (
                      <select value={l.cc} onChange={(e) => cambiar(i, 'cc', e.target.value)} className="campo" aria-label={`Centro de costo línea ${i + 1}`}>
                        <option value="">{c?.requiere_centro_costo ? 'Centro de costo *' : 'Sin centro de costo'}</option>
                        {l.cc && !centros.some((x) => x.codigo === l.cc) && <option value={l.cc}>{l.cc} (inactivo)</option>}
                        {centros.map((x) => <option key={x.codigo} value={x.codigo}>{x.codigo} · {x.nombre}</option>)}
                      </select>
                    )}
                  </td>
                  <td className="px-1 py-1.5">
                    {lineas.length > 2 && <button type="button" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))} className="text-tenue hover:text-peligro" aria-label="Quitar línea">✕</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="font-semibold">
              <td className="px-2 py-2"><button type="button" onClick={() => setLineas((ls) => [...ls, vacia()])} className="boton-sec">+ Línea</button></td>
              <td className="num px-2 py-2 text-right whitespace-nowrap">{clp(totalD)}</td>
              <td className="num px-2 py-2 text-right whitespace-nowrap">{clp(totalH)}</td>
              <td colSpan={2} className={`px-2 py-2 ${cuadra ? 'text-acento' : 'text-aviso'}`}>{cuadra ? '✓ Cuadrado' : `Diferencia ${clp(totalD - totalH)}`}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {advertencias.length > 0 && (
        <div role="alert" className="rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">
          <p className="font-semibold">⚠️ {desdeRCV ? 'Los montos ya no coinciden con lo capturado desde el RCV' : 'Los montos ya no coinciden con el documento asociado'}</p>
          <ul className="mt-1 list-disc pl-5 text-xs">{advertencias.map((a) => <li key={a}>{a}</li>)}</ul>
        </div>
      )}
      {!advertencias.length && montosCambiados && doc0 && <p className="text-xs text-tenue">Cambiaste montos, pero el asiento sigue coincidiendo con el documento.</p>}
      {periodoCerrado && <p className="text-sm text-aviso">El período {fecha.slice(0, 7)} está cerrado: elige otra fecha.</p>}

      <div className="max-w-xl"><label className="etiqueta" htmlFor="motivo">Motivo de la modificación (queda en el registro de actividad)</label>
        <input id="motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: corrige centro de costo del flete" className="campo" /></div>

      <Mensaje {...msg} />
      <div className="flex gap-2">
        <button type="button" className="boton" disabled={pendiente || !cuadra} onClick={guardar}>{pendiente ? 'Guardando…' : `Guardar cambios en el N° ${numero}`}</button>
        <Link href={`/e/${empresaId}/asientos/${id}`} className="boton-sec">Cancelar</Link>
      </div>
    </div>
  );
}
