'use client';

import { useState, useTransition } from 'react';
import { SelectorCC, type CentroOpcion } from '@/components/editor-lineas';
import { Mensaje } from '@/components/form-estado';
import { guardarFicha } from './acciones';

export interface FichaFila {
  rut: string; razon_social: string; giro: string | null; email: string | null; telefono: string | null; direccion: string | null;
  cuenta: string | null; centro_costo: string | null; forma_pago: string | null; activo: boolean;
}
type CuentaOp = { codigo: string; nombre: string; aceptaCC: boolean };
interface Form { rut: string; razonSocial: string; cuenta: string; cc: string; formaPago: string; giro: string; email: string; telefono: string; direccion: string; activo: boolean }
const vacio: Form = { rut: '', razonSocial: '', cuenta: '', cc: '', formaPago: '', giro: '', email: '', telefono: '', direccion: '', activo: true };
const deFila = (f: FichaFila): Form => ({ rut: f.rut, razonSocial: f.razon_social, cuenta: f.cuenta ?? '', cc: f.centro_costo ?? '', formaPago: f.forma_pago ?? '',
  giro: f.giro ?? '', email: f.email ?? '', telefono: f.telefono ?? '', direccion: f.direccion ?? '', activo: f.activo });
const FP: Record<string, string> = { clientes: 'Por cobrar', banco: 'Contado (banco)', deudores: 'Deudores varios', tarjetas: 'Tarjetas' };

export function TablaFichas({ empresaId, tipo, filas, cuentas, centros, escribe }: {
  empresaId: string; tipo: 'proveedor' | 'cliente'; filas: FichaFila[]; cuentas: CuentaOp[]; centros: CentroOpcion[]; escribe: boolean;
}) {
  const [q, setQ] = useState('');
  const [soloSinCuenta, setSoloSinCuenta] = useState(false);
  const [editando, setEditando] = useState<string | null>(null); // rut o 'nuevo'
  const [form, setForm] = useState<Form>(vacio);
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const nombreCuenta = new Map(cuentas.map((c) => [c.codigo, c.nombre]));
  const nombreCC = new Map(centros.map((c) => [c.codigo, c.nombre]));
  const qq = q.trim().toLowerCase();
  const visibles = filas.filter((f) => (!soloSinCuenta || !f.cuenta) && (!qq || f.razon_social.toLowerCase().includes(qq) || f.rut.includes(qq) || (f.cuenta ?? '').startsWith(qq)));
  const aceptaCC = cuentas.find((c) => c.codigo === form.cuenta)?.aceptaCC ?? false;

  const abrir = (f?: FichaFila) => { setMsg({}); setEditando(f ? f.rut : 'nuevo'); setForm(f ? deFila(f) : vacio); };
  function guardar() {
    iniciar(async () => {
      const r = await guardarFicha({ empresaId, tipo, ...form, cc: aceptaCC ? form.cc : '', formaPago: form.formaPago as '' });
      setMsg(r.ok ? { ok: r.mensaje } : { error: r.error });
      if (r.ok) setEditando(null);
    });
  }

  const editor = (
    <div className="space-y-3 rounded-md border border-acento/40 bg-panel-2 p-3 text-sm">
      <datalist id="cuentas-ficha">{cuentas.map((c) => <option key={c.codigo} value={`${c.codigo} · ${c.nombre}`} />)}</datalist>
      <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
        <div><label className="etiqueta" htmlFor="f-rut">RUT</label>
          <input id="f-rut" value={form.rut} disabled={editando !== 'nuevo'} onChange={(e) => setForm({ ...form, rut: e.target.value })} className="campo num" placeholder="12.345.678-9" /></div>
        <div><label className="etiqueta" htmlFor="f-razon">Razón social</label>
          <input id="f-razon" value={form.razonSocial} onChange={(e) => setForm({ ...form, razonSocial: e.target.value })} className="campo" /></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_240px_200px]">
        <div><label className="etiqueta" htmlFor="f-cuenta">Cuenta por defecto ({tipo === 'proveedor' ? 'gasto o costo' : 'ingreso'})</label>
          <input id="f-cuenta" list="cuentas-ficha" value={form.cuenta} onChange={(e) => setForm({ ...form, cuenta: e.target.value.split(' ')[0] })} className="campo num" placeholder="Código o nombre" />
          <div className="mt-0.5 truncate text-xs text-tenue">{form.cuenta ? nombreCuenta.get(form.cuenta) ?? '⚠️ no es una cuenta imputable' : 'Sin cuenta: el RCV la pedirá'}</div></div>
        <div><span className="etiqueta">Centro de costo por defecto</span>
          <SelectorCC valor={aceptaCC ? form.cc : ''} onChange={(v) => setForm({ ...form, cc: v })} centros={centros} deshabilitado={!aceptaCC} /></div>
        {tipo === 'cliente' && (
          <div><label className="etiqueta" htmlFor="f-fp">Forma de cobro</label>
            <select id="f-fp" value={form.formaPago} onChange={(e) => setForm({ ...form, formaPago: e.target.value })} className="campo">
              <option value="">Por cobrar (clientes)</option><option value="banco">Contado (banco)</option><option value="tarjetas">Tarjetas débito o crédito</option><option value="deudores">Deudores varios</option>
            </select></div>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-4">
        {([['giro', 'Giro'], ['email', 'Correo'], ['telefono', 'Teléfono'], ['direccion', 'Dirección']] as [keyof Form, string][]).map(([k, t]) => (
          <div key={k}><label className="etiqueta" htmlFor={`f-${k}`}>{t}</label>
            <input id={`f-${k}`} value={form[k] as string} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="campo" /></div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Activo</label>
      <div className="flex gap-2">
        <button type="button" className="boton" disabled={pendiente} onClick={guardar}>{pendiente ? 'Guardando…' : 'Guardar ficha'}</button>
        <button type="button" className="boton-sec" onClick={() => setEditando(null)}>Cancelar</button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, RUT o cuenta…" className="campo w-72" aria-label="Buscar ficha" />
        <label className="flex items-center gap-2 text-xs text-tenue"><input type="checkbox" checked={soloSinCuenta} onChange={(e) => setSoloSinCuenta(e.target.checked)} /> Sólo sin cuenta por defecto</label>
        <span className="flex-1" />
        <span className="text-xs text-tenue">{visibles.length} de {filas.length}</span>
        {escribe && <button type="button" className="boton-sec" onClick={() => abrir()}>+ Nueva ficha</button>}
      </div>
      <Mensaje {...msg} />
      {editando === 'nuevo' && editor}
      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="text-left text-xs text-tenue uppercase">
            <tr className="border-b border-borde"><th className="px-3 py-2">RUT</th><th className="px-2 py-2">Razón social</th><th className="px-2 py-2">Cuenta por defecto</th>
              <th className="px-2 py-2">Centro de costo</th>{tipo === 'cliente' && <th className="px-2 py-2">Cobro</th>}<th className="w-20" /></tr>
          </thead>
          <tbody>
            {visibles.map((f) => (editando === f.rut ? (
              <tr key={f.rut}><td colSpan={tipo === 'cliente' ? 6 : 5} className="p-2">{editor}</td></tr>
            ) : (
              <tr key={f.rut} className={`border-b border-borde/40 ${f.activo ? '' : 'opacity-50'}`}>
                <td className="num px-3 py-1.5 whitespace-nowrap">{f.rut}</td>
                <td className="px-2 py-1.5">{f.razon_social}{f.giro && <div className="text-xs text-tenue">{f.giro}</div>}</td>
                <td className="px-2 py-1.5">{f.cuenta ? <><span className="num">{f.cuenta}</span> <span className="text-xs text-tenue">{nombreCuenta.get(f.cuenta) ?? ''}</span></> : <span className="text-xs text-aviso">sin cuenta</span>}</td>
                <td className="px-2 py-1.5 text-xs">{f.centro_costo ? `${f.centro_costo} · ${nombreCC.get(f.centro_costo) ?? ''}` : <span className="text-tenue">—</span>}</td>
                {tipo === 'cliente' && <td className="px-2 py-1.5 text-xs">{FP[f.forma_pago ?? 'clientes']}</td>}
                <td className="px-2 py-1.5 text-right">{escribe && <button type="button" className="text-xs text-tenue hover:text-acento" onClick={() => abrir(f)}>✏️ Editar</button>}</td>
              </tr>
            )))}
            {!visibles.length && <tr><td colSpan={6} className="p-6 text-center text-tenue">Sin fichas{q ? ' que coincidan' : ''}.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
