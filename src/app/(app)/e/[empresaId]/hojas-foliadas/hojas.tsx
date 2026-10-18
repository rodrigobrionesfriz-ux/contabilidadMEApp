'use client';

import { useEffect, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { LIBROS, paginar, siguienteBloque, resumenRango, filasControl, csv, tamanoPapel, type ConfigFolios, type FilaLibro, type Rango } from '@/herramientas/folios';
import { Mensaje } from '@/components/form-estado';
import { agregarRango, activarRango, guardarConfig, reservarFolios, cerrarReserva } from './acciones';

export interface ReservaVista { id: string; libro: string; desde: string; hasta: string; folios: number[]; estado: 'reservado' | 'usado' | 'inutilizado'; config: Partial<ConfigFolios>; paginas: FilaLibro[][]; usuario: string; creado: string }
type Impresion = { libro: string; desde: string; hasta: string; cfg: ConfigFolios; paginas: FilaLibro[][]; folios: (number | string)[]; prueba: boolean };

const money = (n: number) => '$ ' + Math.round(+n || 0).toLocaleString('es-CL');
const fechaCL = (s: string) => { if (!s) return ''; const [y, m, d] = s.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };

export function HojasFoliadas({ empresaId, empresa, escribe, libro, desde, hasta, filas, rangos, reservas, config }: {
  empresaId: string; empresa: { nombre: string; rut: string }; escribe: boolean; libro: string; desde: string; hasta: string;
  filas: FilaLibro[]; rangos: Rango[]; reservas: ReservaVista[]; config: ConfigFolios;
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState(config);
  const [rg, setRg] = useState({ desde: '', hasta: '', fecha: '' });
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [imp, setImp] = useState<Impresion | null>(null);
  const [pendiente, iniciar] = useTransition();
  const paginas = paginar(filas, cfg.lineas);
  const activo = rangos.find((r) => r.activo) || null;
  const res = resumenRango(activo, reservas);
  const bloque = siguienteBloque(activo, reservas, paginas.length);
  const ir = (c: Record<string, string>) => router.push('?' + new URLSearchParams({ libro, desde, hasta, ...c }).toString());
  const run = (fn: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>) => iniciar(async () => { const r = await fn(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) router.refresh(); });
  const setC = (c: Partial<ConfigFolios>) => { const n = { ...cfg, ...c }; setCfg(n); if (escribe) void guardarConfig(empresaId, n); };

  useEffect(() => {
    if (!imp) return;
    const fin = () => setImp(null);
    window.addEventListener('afterprint', fin);
    const t = setTimeout(() => window.print(), 80);
    return () => { clearTimeout(t); window.removeEventListener('afterprint', fin); };
  }, [imp]);

  const reservar = () => {
    if (!bloque) return;
    if (!confirm(`Se reservarán ${paginas.length} hojas foliadas (${bloque[0]} a ${bloque[bloque.length - 1]}).\n\nUna vez reservadas NO se reutilizan. Si una hoja se atasca o se imprime mal, márcala como inutilizada y consérvala.\n\n¿Continuar con la impresión?`)) return;
    iniciar(async () => {
      const r = await reservarFolios(empresaId, libro, desde, hasta, cfg, paginas);
      setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
      if (r.ok && r.folios) { setImp({ libro, desde, hasta, cfg, paginas, folios: r.folios, prueba: false }); router.refresh(); }
    });
  };
  const exportarCSV = () => {
    const blob = new Blob([csv(filasControl(rangos, reservas))], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `control_hojas_sueltas_${empresa.rut.replace(/[^0-9kK]/g, '')}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const num = (k: keyof ConfigFolios, lbl: string) => (
    <div className="w-28"><label className="etiqueta" htmlFor={`fc-${k}`}>{lbl}</label><input id={`fc-${k}`} type="number" className="campo" defaultValue={cfg[k] as number} onBlur={(e) => setC({ [k]: Number(e.target.value) } as Partial<ConfigFolios>)} /></div>
  );

  return (
    <div className="space-y-4">
      <Mensaje {...msg} />
      <section className="tarjeta space-y-3 p-4 text-sm">
        <h2 className="font-semibold">1. Rango físico autorizado</h2>
        {escribe && <div className="flex flex-wrap items-end gap-2">
          <div className="w-32"><label className="etiqueta" htmlFor="rg-d">Folio inicial</label><input id="rg-d" type="number" min={1} className="campo" value={rg.desde} onChange={(e) => setRg({ ...rg, desde: e.target.value })} /></div>
          <div className="w-32"><label className="etiqueta" htmlFor="rg-h">Folio final</label><input id="rg-h" type="number" min={1} className="campo" value={rg.hasta} onChange={(e) => setRg({ ...rg, hasta: e.target.value })} /></div>
          <div className="w-44"><label className="etiqueta" htmlFor="rg-f">Fecha autorización/timbraje</label><input id="rg-f" type="date" className="campo" value={rg.fecha} onChange={(e) => setRg({ ...rg, fecha: e.target.value })} /></div>
          <button type="button" className="boton" disabled={pendiente} onClick={() => run(() => agregarRango(empresaId, Number(rg.desde), Number(rg.hasta), rg.fecha))}>＋ Registrar rango</button>
        </div>}
        {activo && <div className="grid gap-2 sm:grid-cols-5">{([['Rango activo', `${activo.desde}–${activo.hasta}`], ['Disponibles', res.libres], ['Usados', res.usados], ['Reservados', res.reservados], ['Inutilizados', res.inutilizados]] as [string, string | number][]).map(([k, v]) => <div key={k} className="rounded-md border border-borde p-2"><div className="text-[10px] text-tenue uppercase">{k}</div><div className="num font-semibold">{v}</div></div>)}</div>}
        <table className="w-full text-xs"><thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Rango</th><th>Autorización</th><th>Estado</th><th /></tr></thead>
          <tbody>{rangos.length ? rangos.map((r) => <tr key={r.id} className="border-b border-borde/30"><td className="num py-1">{r.desde}–{r.hasta}</td><td>{r.fechaAutorizacion ? fechaCL(r.fechaAutorizacion) : '–'}</td><td>{r.activo ? <span className="text-acento">ACTIVO</span> : '–'}</td><td className="text-right">{!r.activo && escribe && <button type="button" className="boton-sec !px-2 !py-0.5" onClick={() => run(() => activarRango(empresaId, r.id))}>Usar</button>}</td></tr>)
            : <tr><td colSpan={4} className="py-2 text-tenue">Sin rangos registrados.</td></tr>}</tbody></table>
      </section>

      <section className="tarjeta space-y-3 p-4 text-sm">
        <h2 className="font-semibold">2. Preparar el libro</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="etiqueta" htmlFor="fl-l">Libro</label><select id="fl-l" className="campo w-56" value={libro} onChange={(e) => ir({ libro: e.target.value })}>{Object.entries(LIBROS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          {libro !== 'inventario' && <div><label className="etiqueta" htmlFor="fl-d">Desde</label><input id="fl-d" type="date" className="campo" defaultValue={desde} onBlur={(e) => e.target.value !== desde && ir({ desde: e.target.value })} /></div>}
          <div><label className="etiqueta" htmlFor="fl-h">{libro === 'inventario' ? 'Saldos al' : 'Hasta'}</label><input id="fl-h" type="date" className="campo" defaultValue={hasta} onBlur={(e) => e.target.value !== hasta && ir({ hasta: e.target.value })} /></div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><label className="etiqueta" htmlFor="fc-p">Papel</label><select id="fc-p" className="campo w-28" value={cfg.papel} onChange={(e) => setC({ papel: e.target.value as ConfigFolios['papel'] })}><option>A4</option><option>Carta</option><option>Oficio</option></select></div>
          <div><label className="etiqueta" htmlFor="fc-o">Orientación</label><select id="fc-o" className="campo w-32" value={cfg.orientacion} onChange={(e) => setC({ orientacion: e.target.value as ConfigFolios['orientacion'] })}><option value="portrait">Vertical</option><option value="landscape">Horizontal</option></select></div>
          {num('lineas', 'Líneas por hoja')}
          <div><label className="etiqueta" htmlFor="fc-or">Alimentación</label><select id="fc-or" className="campo w-44" value={cfg.orden} onChange={(e) => setC({ orden: e.target.value as ConfigFolios['orden'] })}><option value="asc">Folio menor primero</option><option value="desc">Folio mayor primero</option></select></div>
          {num('margenSup', 'Margen sup. mm')}{num('margenDer', 'Derecho')}{num('margenInf', 'Inferior')}{num('margenIzq', 'Izquierdo')}
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" checked={cfg.mostrarFolio} onChange={(e) => setC({ mostrarFolio: e.target.checked })} />Imprimir también el número de folio previsto al pie (desmárcalo si la hoja ya lo trae preimpreso)</label>
        <div className="grid gap-2 sm:grid-cols-4">{([[LIBROS[libro], libro === 'inventario' ? `al ${fechaCL(hasta)}` : `${fechaCL(desde)} al ${fechaCL(hasta)}`], ['Líneas', filas.length], ['Hojas', paginas.length], ['Folios previstos', bloque ? `${bloque[0]}–${bloque[bloque.length - 1]}` : '–']] as [string, string | number][]).map(([k, v]) => <div key={k} className="rounded-md border border-borde p-2"><div className="text-[10px] text-tenue uppercase">{k}</div><div className="num font-semibold">{v}</div></div>)}</div>
        {!activo ? <p className="text-amber-500">⚠️ Primero registra un rango de folios previamente autorizado o timbrado por el SII.</p>
          : !bloque ? <p className="text-amber-500">⚠️ No quedan {paginas.length} folios consecutivos disponibles en el rango activo.</p> : null}
        {libro === 'inventario' && <p className="text-xs text-tenue">ℹ️ Este libro imprime la base por cuentas y saldos. Cuando una cuenta requiera individualizar bienes o deudas, compleméntalo con el detalle de inventario antes de cerrar el libro.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="boton-sec" onClick={() => setImp({ libro, desde, hasta, cfg, paginas, folios: paginas.map((_, i) => i + 1), prueba: true })}>🧪 Prueba en hoja blanca</button>
          {escribe && <button type="button" className="boton" disabled={pendiente || !bloque || !filas.length} onClick={reservar}>🖨️ Reservar folios e imprimir</button>}
        </div>
        <p className="text-xs text-amber-500">Antes del primer uso real imprime una prueba en hoja blanca y superponla sobre una hoja autorizada para calibrar márgenes. No cargues hojas foliadas durante la prueba.</p>
      </section>

      <section className="tarjeta space-y-3 p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">3. Control de hojas sueltas</h2><button type="button" className="boton-sec" onClick={exportarCSV}>📄 Exportar control CSV</button></div>
        <p className="text-xs text-tenue">Las hojas inutilizadas no vuelven a quedar disponibles. Consérvalas físicamente según tu control documental.</p>
        <table className="w-full text-xs"><thead className="text-left text-tenue"><tr className="border-b border-borde"><th className="py-1">Folios</th><th>Libro</th><th>Período</th><th>Estado</th><th>Usuario</th><th /></tr></thead>
          <tbody>{reservas.length ? reservas.map((m) => (
            <tr key={m.id} className="border-b border-borde/30"><td className="num py-1">{m.folios[0]}–{m.folios[m.folios.length - 1]}</td><td>{LIBROS[m.libro]}</td><td>{fechaCL(m.desde)} al {fechaCL(m.hasta)}</td>
              <td className={m.estado === 'usado' ? 'text-acento' : m.estado === 'inutilizado' ? 'text-peligro' : 'text-amber-500'}>{m.estado.toUpperCase()}</td><td>{m.usuario}</td>
              <td className="text-right whitespace-nowrap">{m.estado === 'reservado' && <>
                <button type="button" className="boton-sec !px-2 !py-0.5" onClick={() => setImp({ libro: m.libro, desde: m.desde, hasta: m.hasta, cfg: { ...cfg, ...m.config } as ConfigFolios, paginas: m.paginas, folios: m.folios, prueba: false })}>🖨️ Reimprimir</button>
                {escribe && <><button type="button" className="boton-sec ml-1 !px-2 !py-0.5" onClick={() => confirm(`¿Confirmas que las hojas ${m.folios[0]}–${m.folios[m.folios.length - 1]} quedaron USADAS?`) && run(() => cerrarReserva(empresaId, m.id, 'usado'))}>✓ Usadas</button>
                  <button type="button" className="boton-sec ml-1 !px-2 !py-0.5" onClick={() => confirm(`¿Confirmas que las hojas ${m.folios[0]}–${m.folios[m.folios.length - 1]} quedaron INUTILIZADAS?`) && run(() => cerrarReserva(empresaId, m.id, 'inutilizado'))}>✕ Inutilizadas</button></>}
              </>}</td></tr>
          )) : <tr><td colSpan={6} className="py-2 text-tenue">Aún no hay folios utilizados.</td></tr>}</tbody></table>
        <p className="text-xs text-tenue"><strong>Nota tributaria:</strong> desde agosto de 2017 el Registro de Compras y Ventas reemplaza el antiguo timbraje del Libro de Compras y Ventas; por eso aquí se imprimen los libros de contabilidad en hojas sueltas.</p>
      </section>

      {imp && createPortal(<Impresion imp={imp} empresa={empresa} />, document.body)}
    </div>
  );
}

function Impresion({ imp, empresa }: { imp: Impresion; empresa: { nombre: string; rut: string } }) {
  const { size, w, h } = tamanoPapel(imp.cfg);
  const c = imp.cfg;
  const arr = imp.paginas.map((rows, i) => ({ rows, folio: imp.folios[i] ?? 'PRUEBA', idx: i }));
  if (c.orden === 'desc') arr.reverse();
  const periodo = imp.libro === 'inventario' ? `Saldos al ${fechaCL(imp.hasta)}` : `${fechaCL(imp.desde)} al ${fechaCL(imp.hasta)}`;
  return (
    <div id="folio-print-root" className="hidden print:block">
      <style>{`@media print{@page{size:${size} ${c.orientacion};margin:0}body>*:not(#folio-print-root){display:none!important}body{margin:0!important;background:#fff!important}#folio-print-root{display:block!important;background:#fff;color:#000}
        .fs{box-sizing:border-box;position:relative;width:${w}mm;height:${h}mm;padding:${c.margenSup}mm ${c.margenDer}mm ${c.margenInf}mm ${c.margenIzq}mm;page-break-after:always;overflow:hidden;font-family:Arial,sans-serif;font-size:8.3pt;color:#000;background:#fff}
        .fs:last-child{page-break-after:auto}.fs-h{display:flex;justify-content:space-between;gap:8mm;border-bottom:.3mm solid #000;padding-bottom:2mm;margin-bottom:2.5mm;font-size:10pt}
        .fs-p{position:absolute;top:48%;left:10%;right:10%;transform:rotate(-18deg);font-size:23pt;font-weight:800;color:#aaa;text-align:center;opacity:.32}
        .fs table{width:100%;border-collapse:collapse;table-layout:fixed}.fs th,.fs td{border:.2mm solid #777;padding:1.05mm 1.4mm;vertical-align:top;line-height:1.18;text-align:left;overflow-wrap:anywhere}
        .fs .m{text-align:right;white-space:nowrap;overflow-wrap:normal;font-variant-numeric:tabular-nums}.fs .g td{font-weight:700;background:#eee}.fs .t td{font-weight:700;border-top:.4mm solid #000}
        .fs-f{position:absolute;left:${c.margenIzq}mm;right:${c.margenDer}mm;bottom:4mm;display:flex;justify-content:space-between;font-size:7pt;color:#333}}`}</style>
      {arr.map((p) => (
        <section key={p.idx} className="fs">
          <div className="fs-h"><strong>{LIBROS[imp.libro]} · {empresa.nombre} · RUT {empresa.rut}</strong><span>{periodo}</span></div>
          {imp.prueba && <div className="fs-p">PRUEBA DE ALINEACIÓN · NO USAR HOJA FOLIADA</div>}
          <Tabla libro={imp.libro} rows={p.rows} />
          <div className="fs-f"><span>Página {p.idx + 1} de {imp.paginas.length}</span><span>{c.mostrarFolio || imp.prueba ? `Folio físico previsto: ${p.folio}` : ''}</span></div>
        </section>
      ))}
    </div>
  );
}

function Tabla({ libro, rows }: { libro: string; rows: FilaLibro[] }) {
  if (libro === 'mayor') return (
    <table><thead><tr><th style={{ width: '13%' }}>Fecha</th><th style={{ width: '8%' }}>Comp.</th><th>Detalle</th><th style={{ width: '15%' }}>Debe</th><th style={{ width: '15%' }}>Haber</th><th style={{ width: '15%' }}>Saldo</th></tr></thead>
      <tbody>{rows.map((r, i) => r.tipo === 'cuenta' ? <tr key={i} className="g"><td colSpan={6}>{r.cd} · {r.nm} · Saldo anterior {money(r.saldoAnterior)}</td></tr>
        : r.tipo === 'totalMayor' ? <tr key={i} className="t"><td colSpan={3}>Totales cuenta</td><td className="m">{money(r.debe)}</td><td className="m">{money(r.haber)}</td><td className="m">{money(r.saldo)}</td></tr>
          : r.tipo === 'movMayor' ? <tr key={i}><td>{fechaCL(r.fecha)}</td><td>{r.n}</td><td>{r.glosa}</td><td className="m">{r.debe ? money(r.debe) : ''}</td><td className="m">{r.haber ? money(r.haber) : ''}</td><td className="m">{money(r.saldo)}</td></tr> : null)}</tbody></table>
  );
  if (libro === 'inventario') return (
    <table><thead><tr><th style={{ width: '14%' }}>Código</th><th>Cuenta / detalle base</th><th style={{ width: '20%' }}>Saldo deudor</th><th style={{ width: '20%' }}>Saldo acreedor</th></tr></thead>
      <tbody>{rows.map((r, i) => r.tipo === 'inv' ? <tr key={i}><td>{r.cd}</td><td>{r.nm}</td><td className="m">{r.debe ? money(r.debe) : ''}</td><td className="m">{r.haber ? money(r.haber) : ''}</td></tr> : null)}</tbody></table>
  );
  return (
    <table><thead><tr><th style={{ width: '11%' }}>Fecha</th><th style={{ width: '7%' }}>Comp.</th><th style={{ width: '26%' }}>Cuenta</th><th>Glosa / detalle</th><th style={{ width: '13%' }}>Debe</th><th style={{ width: '13%' }}>Haber</th></tr></thead>
      <tbody>{rows.map((r, i) => r.tipo === 'mov' ? <tr key={i}><td>{fechaCL(r.fecha)}</td><td>{r.n}</td><td>{r.cuenta}</td><td>{r.glosa}</td><td className="m">{r.debe ? money(r.debe) : ''}</td><td className="m">{r.haber ? money(r.haber) : ''}</td></tr> : null)}</tbody></table>
  );
}
