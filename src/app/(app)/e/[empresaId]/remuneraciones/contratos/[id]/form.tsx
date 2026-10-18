'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Trabajador } from '@/remuneraciones/calculo';
import { validarContrato, TIPOS_CONTRATO, TIPOS_JORNADA, FORMAS_PAGO, ANTICIPOS, GRAT_FORMAS, type Defaults, type DatosContrato, type FichaContratoDT } from '@/remuneraciones/contrato-dt';
import { Mensaje } from '@/components/form-estado';
import { guardarDatosDT, archivosContratosDT, marcarInformados } from '../acciones';
import { SelComuna, SelNacionalidad, SelLista, EditorHorario } from '../campos';
import { descargarAnsi } from '../descargas';

export function FormDatosDT({ empresaId, trabajador, D, inicial, escribe }: { empresaId: string; trabajador: Trabajador; D: Defaults; inicial: DatosContrato; escribe: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<DatosContrato>(inicial);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const set = (c: Partial<DatosContrato>) => setF((x) => ({ ...x, ...c }));
  const ficha = (): FichaContratoDT => ({
    fechaSuscripcion: f.fechaSuscripcion, tipoContrato: f.tipoContrato, fechaFin: f.fechaFin, fechaNacimiento: f.fechaNacimiento, nacionalidad: f.nacionalidad,
    dni: f.dni.trim(), email: f.email.trim(), telefono: f.telefono.trim(), domComuna: f.domComuna, domCalle: f.domCalle.trim(), domNumero: f.domNumero.trim(), domDpto: f.domDpto.trim(),
    funciones: f.funciones.trim(), comunaCelebracion: f.comunaCelebracion, zona1: f.zona1, tipoJornada: f.tipoJornada, duracion: String(f.duracion),
    nroResolucion: f.nroResolucion.trim(), fechaResolucion: f.fechaResolucion, gratForma: f.gratForma, gratModalidad: f.gratModalidad.trim(),
    diaPago: f.diaPago, formaPago: f.formaPago, anticipo: f.anticipo, colacion: String(f.colacion), subcontratacion: f.subcontratacion, rutPrincipal: f.rutPrincipal.trim(),
    otrosPactos: f.otrosPactos.trim(), horarioPropio: f.horarioPropio, ...(f.horarioPropio ? { horario: f.horario } : {}),
  });
  const v = useMemo(() => validarContrato({ ...trabajador, contratoDT: { ...(trabajador.contratoDT || {}), ...ficha() } }, D), [f, trabajador, D]); // eslint-disable-line react-hooks/exhaustive-deps
  const guardar = (despues?: 'contrato' | 'csv') => iniciar(async () => {
    const r = await guardarDatosDT(empresaId, trabajador.id, ficha());
    if (!r.ok) { setMsg({ error: r.error }); return; }
    setMsg({ ok: r.mensaje });
    if (despues === 'contrato') router.push(`/e/${empresaId}/remuneraciones/contratos/${trabajador.id}/documento`);
    else if (despues === 'csv') {
      const a = await archivosContratosDT(empresaId, [trabajador.id]);
      if (!a.ok) setMsg({ error: `Para descargar el CSV completa: ${a.faltan.flatMap((x) => x.faltan).join(', ') || a.error}` });
      else {
        a.archivos.forEach((x) => descargarAnsi(x.texto, x.nombre));
        if (window.confirm(`${a.avisos.length ? 'Revisa antes de subir:\n• ' + a.avisos.join('\n• ') + '\n\n' : ''}Sube el archivo en Mi DT → Registro de contratos → Carga masiva.\n\n¿Marcar el contrato como informado a la DT?`)) {
          const m = await marcarInformados(empresaId, [trabajador.id], true); setMsg(m.ok ? { ok: m.mensaje } : { error: m.error });
        }
        router.refresh();
      }
    } else router.refresh();
  });
  const texto = (k: keyof DatosContrato, l: string, extra: { tipo?: string; max?: number; ph?: string; span?: boolean } = {}) => (
    <div className={extra.span ? 'sm:col-span-4' : ''}>
      <label className="etiqueta" htmlFor={`cdt-${String(k)}`}>{l}</label>
      <input id={`cdt-${String(k)}`} type={extra.tipo || 'text'} maxLength={extra.max} placeholder={extra.ph} disabled={!escribe} value={String(f[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<DatosContrato>)} className="campo" />
    </div>
  );
  return (
    <div className="space-y-4">
      <section className="tarjeta grid gap-3 p-4 text-sm sm:grid-cols-4">
        <h2 className="font-semibold sm:col-span-4">Contrato</h2>
        {texto('fechaSuscripcion', 'Fecha de suscripción *', { tipo: 'date' })}
        <div><label className="etiqueta" htmlFor="cdt-tc">Tipo de contrato *</label><SelLista id="cdt-tc" value={f.tipoContrato} lista={TIPOS_CONTRATO} onChange={(x) => set({ tipoContrato: x })} disabled={!escribe} /></div>
        {texto('fechaFin', 'Fecha de término (plazo fijo)', { tipo: 'date' })}
        <div><label className="etiqueta" htmlFor="cdt-celeb">Comuna de celebración *</label><SelComuna id="cdt-celeb" value={f.comunaCelebracion} onChange={(x) => set({ comunaCelebracion: x })} disabled={!escribe} /></div>
        {texto('funciones', 'Funciones * (máx. 300)', { max: 300, span: true })}
        <div><label className="etiqueta" htmlFor="cdt-zona">Comuna de prestación de servicios *</label><SelComuna id="cdt-zona" value={f.zona1} onChange={(x) => set({ zona1: x })} disabled={!escribe} /></div>
        <div><label className="etiqueta" htmlFor="cdt-sub">Subcontratación</label><select id="cdt-sub" disabled={!escribe} value={f.subcontratacion ? '1' : '0'} onChange={(e) => set({ subcontratacion: +e.target.value })} className="campo"><option value="0">No</option><option value="1">Sí</option></select></div>
        {f.subcontratacion ? texto('rutPrincipal', 'RUT empresa principal') : <div />}
      </section>
      <section className="tarjeta grid gap-3 p-4 text-sm sm:grid-cols-4">
        <h2 className="font-semibold sm:col-span-4">Trabajador</h2>
        {texto('fechaNacimiento', 'Fecha de nacimiento *', { tipo: 'date' })}
        <div><label className="etiqueta" htmlFor="cdt-nac">Nacionalidad *</label><SelNacionalidad id="cdt-nac" value={f.nacionalidad} onChange={(x) => set({ nacionalidad: x })} disabled={!escribe} /></div>
        {texto('dni', 'DNI (sólo extranjero sin RUT)')}
        {texto('email', 'Email')}
        {texto('telefono', 'Teléfono', { ph: '9XXXXXXXX' })}
        <div><label className="etiqueta" htmlFor="cdt-dcom">Comuna domicilio *</label><SelComuna id="cdt-dcom" value={f.domComuna} onChange={(x) => set({ domComuna: x })} disabled={!escribe} /></div>
        {texto('domCalle', 'Calle *')}
        <div className="grid grid-cols-2 gap-2">{texto('domNumero', 'Número')}{texto('domDpto', 'Depto.')}</div>
      </section>
      <section className="tarjeta grid gap-3 p-4 text-sm sm:grid-cols-4">
        <h2 className="font-semibold sm:col-span-4">Jornada y remuneración</h2>
        <div><label className="etiqueta" htmlFor="cdt-tj">Tipo de jornada</label><SelLista id="cdt-tj" value={f.tipoJornada} lista={TIPOS_JORNADA} onChange={(x) => set({ tipoJornada: x })} disabled={!escribe} /></div>
        {texto('duracion', 'Duración (h semanales)')}
        {f.tipoJornada === 6 ? <>{texto('nroResolucion', 'N° resolución', { max: 12 })}{texto('fechaResolucion', 'Fecha resolución', { tipo: 'date' })}</> : <><div /><div /></>}
        {texto('colacion', 'Colación (min)')}
        <div><label className="etiqueta" htmlFor="cdt-grat">Gratificación</label><SelLista id="cdt-grat" value={f.gratForma} lista={GRAT_FORMAS} onChange={(x) => set({ gratForma: x })} disabled={!escribe} /></div>
        {f.gratForma === 3 ? texto('gratModalidad', 'Modalidad (convencional) *') : <div />}
        {texto('diaPago', 'Día de pago')}
        <div><label className="etiqueta" htmlFor="cdt-forma">Forma de pago</label><SelLista id="cdt-forma" value={f.formaPago} lista={FORMAS_PAGO} onChange={(x) => set({ formaPago: x })} disabled={!escribe} /></div>
        <div><label className="etiqueta" htmlFor="cdt-ant">Anticipo</label><SelLista id="cdt-ant" value={f.anticipo} lista={ANTICIPOS} onChange={(x) => set({ anticipo: x })} disabled={!escribe} /></div>
        {texto('otrosPactos', 'Otros pactos (opcional, máx. 2.000)', { max: 2000, span: true })}
        <label className="flex items-center gap-2 text-xs sm:col-span-4"><input type="checkbox" checked={f.horarioPropio} disabled={!escribe} onChange={(e) => set({ horarioPropio: e.target.checked })} /> Horario propio (si no, usa el de la empresa)</label>
        <div className={`sm:col-span-4 ${f.horarioPropio ? '' : 'opacity-50'}`}><EditorHorario prefijo="cdt" horario={f.horario} onChange={(h) => set({ horario: h })} disabled={!escribe || !f.horarioPropio} /></div>
      </section>
      {v.faltan.length > 0 && <p className="text-xs text-peligro">⛔ Falta: {v.faltan.join(', ')}</p>}
      {v.avisos.map((a, i) => <p key={i} className="text-xs text-amber-500">⚠️ {a}</p>)}
      {v.ok && <p className="text-xs text-acento">✅ Datos completos para la DT.</p>}
      {escribe && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="boton" disabled={pendiente} onClick={() => guardar()}>💾 Guardar datos</button>
          <button type="button" className="boton-sec" disabled={pendiente} onClick={() => guardar('contrato')}>📄 Guardar y ver contrato</button>
          <button type="button" className="boton-sec" disabled={pendiente} onClick={() => guardar('csv')}>⬇️ Guardar y descargar CSV DT</button>
        </div>
      )}
      <Mensaje {...msg} />
    </div>
  );
}
