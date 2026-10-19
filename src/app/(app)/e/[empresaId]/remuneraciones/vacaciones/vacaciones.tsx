'use client';

import { Fragment, useState, useTransition } from 'react';
import { diasHabiles, type CfgFeriados } from '@/remuneraciones/vacaciones';
import { fechaCL, hoyISO } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { registrarVacaciones, borrarVacaciones, guardarConfigVacaciones, guardarFeriados } from './acciones';

export interface FilaVac {
  id: string; nombre: string; motivo?: string;
  cfg: { aniosPrevios: string; saldoInicial: string; fechaSaldo: string; zonaExtrema: boolean };
  saldo: null | {
    inicio: string; mesesTot: number; anual: number; progActual: number; faltan: number | null; inicial: number | null; desdeDev: string;
    devengado: number; diasTomados: number; saldo: number; excede: boolean; aniosPrevios: number;
    tomadas: { id: string; desde: string; hasta: string; habiles: number; feriados: number }[];
  };
}
const f2 = (n: number) => (+n || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function Vacaciones({ empresaId, filas, escribe, admin, feriadosTexto, nFeriados, anio, feriados }: {
  empresaId: string; filas: FilaVac[]; escribe: boolean; admin: boolean; feriadosTexto: string; nFeriados: number; anio: number; feriados: CfgFeriados;
}) {
  const [abierto, setAbierto] = useState<{ id: string; modo: 'vac' | 'cfg' } | null>(null);
  const [vac, setVac] = useState({ desde: hoyISO(), hasta: hoyISO(), obs: '' });
  const [cfg, setCfg] = useState<FilaVac['cfg']>({ aniosPrevios: '', saldoInicial: '', fechaSaldo: '', zonaExtrema: false });
  const [fer, setFer] = useState(feriadosTexto);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const prev = diasHabiles(vac.desde, vac.hasta || vac.desde, feriados);
  const run = (f: () => Promise<{ ok: boolean; mensaje?: string; error?: string }>, cerrar = true) => iniciar(async () => {
    const r = await f(); setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok && cerrar) setAbierto(null);
  });
  const registrar = (id: string) => iniciar(async () => {
    let r = await registrarVacaciones(empresaId, id, vac.desde, vac.hasta, vac.obs, false);
    if (!r.ok && r.confirmar) { if (!window.confirm(r.confirmar)) return; r = await registrarVacaciones(empresaId, id, vac.desde, vac.hasta, vac.obs, true); }
    setMsg(r.ok ? { ok: r.mensaje } : { error: r.error }); if (r.ok) setAbierto(null);
  });
  return (
    <div className="space-y-4">
      <Mensaje {...msg} />
      <div className="tarjeta overflow-x-auto">
        <table className="w-full min-w-[900px] text-xs">
          <thead className="text-left text-tenue uppercase">
            <tr className="border-b border-borde"><th className="px-3 py-2">Trabajador</th><th className="px-2 py-2 text-right">Días/año</th><th className="px-2 py-2 text-right">Progresivos</th>
              <th className="px-2 py-2 text-right">Saldo inicial</th><th className="px-2 py-2 text-right">Devengado</th><th className="px-2 py-2 text-right">Tomados</th>
              <th className="px-2 py-2 text-right">Saldo</th><th className="px-2 py-2 text-right">Períodos</th><th /></tr>
          </thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-tenue">Registra trabajadores para llevar sus vacaciones.</td></tr>}
            {filas.map((t) => {
              const s = t.saldo;
              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-borde/40 align-top">
                    <td className="px-3 py-1.5">
                      <div className="font-medium">{t.nombre}</div>
                      {s && <div className="text-tenue">Ingreso {fechaCL(s.inicio)} · {Math.floor(s.mesesTot / 12)} a {s.mesesTot % 12} m{s.aniosPrevios ? ` · +${s.aniosPrevios} año(s) anteriores` : ''}{t.cfg.zonaExtrema ? ' · zona extrema' : ''}</div>}
                      {s?.tomadas.map((e) => (
                        <div key={e.id} className="text-tenue">🏖️ {fechaCL(e.desde)}{e.hasta !== e.desde ? ` → ${fechaCL(e.hasta)}` : ''} · {e.habiles} día(s) hábil(es){e.feriados ? ` · ${e.feriados} feriado(s)` : ''}
                          {escribe && <button type="button" className="ml-2 hover:text-peligro" onClick={() => window.confirm('¿Eliminar estas vacaciones?') && run(() => borrarVacaciones(empresaId, e.id), false)}>✕</button>}</div>
                      ))}
                    </td>
                    {s ? (<>
                      <td className="num px-2 py-1.5 text-right">{s.anual}</td>
                      <td className="num px-2 py-1.5 text-right" title={s.faltan ? `Próximo día progresivo en ${s.faltan} año(s)` : ''}>{s.progActual || '–'}{s.faltan && s.faltan <= 3 ? <div className="text-[10px] text-tenue">+1 en {s.faltan} a</div> : null}</td>
                      <td className="num px-2 py-1.5 text-right">{s.inicial != null ? f2(s.inicial) : '–'}{s.inicial != null && <div className="text-[10px] text-tenue">al {fechaCL(s.desdeDev)}</div>}</td>
                      <td className="num px-2 py-1.5 text-right">{f2(s.devengado)}</td>
                      <td className="num px-2 py-1.5 text-right text-peligro">{s.diasTomados || '–'}</td>
                      <td className={`num px-2 py-1.5 text-right font-semibold ${s.saldo < 0 ? 'text-peligro' : s.excede ? 'text-aviso' : 'text-acento'}`}>{f2(s.saldo)}{s.excede && <div className="text-[10px]">⚠️ más de 2 períodos</div>}</td>
                      <td className="num px-2 py-1.5 text-right">{f2(s.saldo / s.anual)}</td>
                    </>) : <td colSpan={7} className="px-2 py-1.5 text-aviso">⚠️ {t.motivo}</td>}
                    <td className="px-3 py-1.5 text-right whitespace-nowrap">
                      {escribe && s && <button type="button" className="boton-sec py-1 text-xs" onClick={() => { setAbierto({ id: t.id, modo: 'vac' }); setVac({ desde: hoyISO(), hasta: hoyISO(), obs: '' }); }}>+ Vacaciones</button>}
                      {escribe && <button type="button" className="ml-2 text-tenue hover:text-texto" title="Saldo inicial, años anteriores, zona extrema" aria-label={`Configurar vacaciones de ${t.nombre}`}
                        onClick={() => { setAbierto({ id: t.id, modo: 'cfg' }); setCfg(t.cfg); }}>⚙️</button>}
                    </td>
                  </tr>
                  {abierto?.id === t.id && abierto.modo === 'vac' && (
                    <tr className="border-b border-borde/40 bg-panel-2/40"><td colSpan={9} className="px-3 py-3">
                      <div className="grid gap-2 sm:grid-cols-[150px_150px_1fr_auto] sm:items-end">
                        <div><label className="etiqueta" htmlFor="v-desde">Desde</label><input id="v-desde" type="date" value={vac.desde} onChange={(e) => setVac({ ...vac, desde: e.target.value, hasta: vac.hasta < e.target.value ? e.target.value : vac.hasta })} className="campo" /></div>
                        <div><label className="etiqueta" htmlFor="v-hasta">Hasta</label><input id="v-hasta" type="date" value={vac.hasta} onChange={(e) => setVac({ ...vac, hasta: e.target.value })} className="campo" /></div>
                        <div><label className="etiqueta" htmlFor="v-obs">Observación</label><input id="v-obs" value={vac.obs} onChange={(e) => setVac({ ...vac, obs: e.target.value })} className="campo" /></div>
                        <div className="flex gap-2"><button type="button" className="boton" disabled={pendiente || !prev.habiles} onClick={() => registrar(t.id)}>Registrar</button><button type="button" className="boton-sec" onClick={() => setAbierto(null)}>Cancelar</button></div>
                      </div>
                      <p className="mt-2 text-tenue">{prev.habiles} día(s) hábil(es){prev.feriados.length ? ` · no cuenta ${prev.feriados.map((f) => `${fechaCL(f.fecha)} ${f.nombre}`).join(', ')}` : ''}{s ? ` · saldo después: ${f2(s.saldo - prev.habiles)}` : ''}</p>
                    </td></tr>
                  )}
                  {abierto?.id === t.id && abierto.modo === 'cfg' && (
                    <tr className="border-b border-borde/40 bg-panel-2/40"><td colSpan={9} className="px-3 py-3">
                      <div className="grid gap-2 sm:grid-cols-4 sm:items-end">
                        <div><label className="etiqueta" htmlFor="c-prev">Años con empleadores anteriores</label><input id="c-prev" inputMode="numeric" value={cfg.aniosPrevios} onChange={(e) => setCfg({ ...cfg, aniosPrevios: e.target.value })} className="campo num" placeholder="0" /><p className="mt-1 text-[10px] text-tenue">Certificados; se consideran hasta 10</p></div>
                        <div><label className="etiqueta" htmlFor="c-saldo">Saldo inicial (días hábiles)</label><input id="c-saldo" inputMode="decimal" value={cfg.saldoInicial} onChange={(e) => setCfg({ ...cfg, saldoInicial: e.target.value })} className="campo num" placeholder="Opcional" /></div>
                        <div><label className="etiqueta" htmlFor="c-fecha">Saldo al</label><input id="c-fecha" type="date" value={cfg.fechaSaldo} onChange={(e) => setCfg({ ...cfg, fechaSaldo: e.target.value })} className="campo" /></div>
                        <div><label className="etiqueta" htmlFor="c-zona">Zona extrema</label><select id="c-zona" value={cfg.zonaExtrema ? '1' : '0'} onChange={(e) => setCfg({ ...cfg, zonaExtrema: e.target.value === '1' })} className="campo"><option value="0">No (15 días)</option><option value="1">Sí (20 días)</option></select></div>
                      </div>
                      <p className="mt-2 text-tenue">Con saldo inicial, el devengo se cuenta desde esa fecha: úsalo para trabajadores que tomaron vacaciones antes de registrarlas aquí.</p>
                      <div className="mt-2 flex gap-2"><button type="button" className="boton" disabled={pendiente} onClick={() => run(() => guardarConfigVacaciones(empresaId, t.id, cfg))}>Guardar</button><button type="button" className="boton-sec" onClick={() => setAbierto(null)}>Cancelar</button></div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-tenue">Las vacaciones registradas aquí también aparecen en Asistencia (se pagan normalmente) y en el LRE.</p>
      <section className="tarjeta space-y-2 p-4 text-sm">
        <h2 className="font-semibold">📅 Feriados adicionales</h2>
        <p className="text-xs text-tenue">Los feriados nacionales se calculan solos ({anio}: {nFeriados} feriados). Agrega elecciones, feriados regionales o decretados, uno por línea: AAAA-MM-DD nombre. Para quitar uno: - AAAA-MM-DD.</p>
        <textarea aria-label="Feriados adicionales" rows={4} disabled={!admin} value={fer} onChange={(e) => setFer(e.target.value)} className="campo num w-full" />
        {admin ? <button type="button" className="boton-sec" disabled={pendiente} onClick={() => run(() => guardarFeriados(empresaId, fer), false)}>Guardar feriados</button>
          : <p className="text-xs text-tenue">Sólo un administrador puede cambiarlos.</p>}
      </section>
    </div>
  );
}
