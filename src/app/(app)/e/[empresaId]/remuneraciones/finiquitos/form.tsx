'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Trabajador } from '@/remuneraciones/calculo';
import { calcularFiniquito, CAUSALES, NUMERALES_160, MARCADORES, causalInfo, textoFiniquito, type FormFiniquito, type FilaExtra } from '@/remuneraciones/finiquito';
import { clp, fechaCL, decimalCL, decimalTexto } from '@/lib/formato';
import { leerArchivoTexto } from '@/lib/leer-texto';
import { Mensaje } from '@/components/form-estado';
import { guardarFiniquito } from './acciones';
import type { datosFormulario } from './cargar-form';

type Datos = Awaited<ReturnType<typeof datosFormulario>>;
const n2 = (n: number) => (+n || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function FormularioFiniquito({ empresaId, id, datos, trabajadores, inicial, textoInicial }: {
  empresaId: string; id: string | null; datos: Datos; trabajadores: Trabajador[]; inicial: FormFiniquito; textoInicial: string;
}) {
  const router = useRouter();
  const [f, setF] = useState<FormFiniquito>(inicial);
  const [ufTxt, setUfTxt] = useState(decimalTexto(+inicial.uf));
  const [texto, setTexto] = useState(textoInicial);
  const [editTexto, setEditTexto] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const set = (c: Partial<FormFiniquito>) => setF((x) => ({ ...x, ...c }));
  const t = trabajadores.find((x) => x.id === f.trab);
  const c = causalInfo(f.causal);
  const r = useMemo(() => {
    if (!t) return null;
    try { return calcularFiniquito(t, { ...f, uf: decimalCL(ufTxt) }, { ctx: datos.ctx, utm: datos.utm, feriados: datos.feriados }); } catch { return null; }
  }, [t, f, ufTxt, datos]);
  const textoEfectivo = textoFiniquito({ texto, plantillaId: f.plantillaId, causal: f.causal }, datos.plantillas);
  const plDef = datos.plantillas.find((p) => p.id === c.plantilla);

  const campo = (k: keyof FormFiniquito, l: string, extra: { tipo?: string; ph?: string; ayuda?: string } = {}) => (
    <div>
      <label className="etiqueta" htmlFor={`fin-${String(k)}`}>{l}</label>
      <input id={`fin-${String(k)}`} type={extra.tipo || 'text'} inputMode={extra.tipo ? undefined : 'decimal'} placeholder={extra.ph}
        value={String(f[k] ?? '')} onChange={(e) => set({ [k]: e.target.value } as Partial<FormFiniquito>)} className={`campo ${extra.tipo ? '' : 'num'}`} />
      {extra.ayuda && <p className="mt-1 text-[10px] text-tenue">{extra.ayuda}</p>}
    </div>
  );
  const ck = (k: keyof FormFiniquito, l: string) => (
    <label className="flex items-center gap-2"><input type="checkbox" checked={f[k] !== false && !!(f[k] ?? true)} onChange={(e) => set({ [k]: e.target.checked } as Partial<FormFiniquito>)} /> {l}</label>
  );
  const filasExtra = (k: 'haberesExtra' | 'descuentosExtra', titulo: string, boton: string) => {
    const arr: FilaExtra[] = f[k] || [];
    const upd = (i: number, x: Partial<FilaExtra>) => set({ [k]: arr.map((y, j) => (j === i ? { ...y, ...x } : y)) } as Partial<FormFiniquito>);
    return (
      <div>
        <p className="etiqueta">{titulo}</p>
        {arr.map((x, i) => (
          <div key={i} className="mb-1 flex gap-2">
            <input aria-label={`${titulo} descripción ${i + 1}`} value={x.d} onChange={(e) => upd(i, { d: e.target.value })} placeholder="Descripción" className="campo flex-[2]" />
            <input aria-label={`${titulo} monto ${i + 1}`} value={String(x.m)} onChange={(e) => upd(i, { m: e.target.value })} placeholder="Monto" inputMode="numeric" className="campo num flex-1 text-right" />
            <button type="button" className="text-tenue hover:text-peligro" onClick={() => set({ [k]: arr.filter((_, j) => j !== i) } as Partial<FormFiniquito>)}>✕</button>
          </div>
        ))}
        <button type="button" className="text-xs text-acento hover:underline" onClick={() => set({ [k]: [...arr, { d: '', m: '' }] } as Partial<FormFiniquito>)}>{boton}</button>
      </div>
    );
  };
  const subir = async (file: File | undefined) => {
    if (!file) return;
    try { setTexto(await leerArchivoTexto(file)); setEditTexto(true); setMsg({ ok: 'Texto cargado. Revisa los marcadores antes de guardar.' }); }
    catch (e) { setMsg({ error: e instanceof Error ? e.message : String(e) }); }
  };
  const guardar = () => iniciar(async () => {
    const propio = texto.trim() && texto.trim() !== (datos.plantillas.find((p) => p.id === (f.plantillaId || c.plantilla))?.texto || '').trim() ? texto : null;
    const res = await guardarFiniquito(empresaId, id, { ...f, uf: decimalCL(ufTxt) }, propio);
    if (!res.ok) { setMsg({ error: res.error }); return; }
    router.push(`/e/${empresaId}/remuneraciones/finiquitos/${res.id}`);
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <section className="tarjeta grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor="fin-trab">Trabajador</label>
            <select id="fin-trab" value={f.trab} onChange={(e) => { const nt = trabajadores.find((x) => x.id === e.target.value); set({ trab: e.target.value, codigoLRE: nt?.lre?.causalTermino || '' }); }} className="campo">
              {trabajadores.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.rut ? ` · ${x.rut}` : ''}</option>)}
            </select>
            <p className="mt-1 text-[10px] text-tenue">{t?.lre?.fechaInicio ? `Ingreso ${fechaCL(t.lre.fechaInicio)} · ${t.contrato === 'plazo' ? 'plazo fijo' : t.contrato === 'obra' ? 'por obra' : 'indefinido'}` : <span className="text-aviso">⚠️ Falta la fecha de inicio en la ficha</span>}</p>
          </div>
          {campo('fechaTermino', 'Fecha de término', { tipo: 'date' })}
          <div className="sm:col-span-2">
            <label className="etiqueta" htmlFor="fin-causal">Causal</label>
            <select id="fin-causal" value={f.causal} onChange={(e) => set({ causal: e.target.value })} className="campo">
              {CAUSALES.map((x) => <option key={x.k} value={x.k}>{x.nm} ({x.art.replace('artículo', 'Art.')})</option>)}
            </select>
          </div>
          {c.numeral && (
            <div><label className="etiqueta" htmlFor="fin-numeral">Numeral del Art. 160</label>
              <select id="fin-numeral" value={f.numeral160 || ''} onChange={(e) => set({ numeral160: e.target.value })} className="campo">
                <option value="">Seleccionar…</option>{NUMERALES_160.map((x) => <option key={x[0]} value={x[0]}>{x[1]} {x[2]}</option>)}
              </select></div>
          )}
          {(c.aviso || c.hechos) && campo('fechaAviso', c.aviso === 'renuncia' ? 'Fecha de la carta de renuncia' : 'Fecha de la carta de aviso', { tipo: 'date', ayuda: c.aviso === 'despido' ? 'Con menos de 30 días de anticipación se paga la indemnización sustitutiva' : undefined })}
          {c.hechos && (
            <div className="sm:col-span-3"><label className="etiqueta" htmlFor="fin-hechos">Hechos que fundamentan la causal</label>
              <textarea id="fin-hechos" rows={2} value={f.hechos || ''} onChange={(e) => set({ hechos: e.target.value })} className="campo" placeholder="Los mismos indicados en la carta de aviso" /></div>
          )}
          {campo('fecha', 'Fecha del finiquito', { tipo: 'date' })}
          {campo('ciudad', 'Ciudad de firma', { tipo: 'text' })}
          {campo('formaPago', 'Forma de pago', { tipo: 'text', ph: 'transferencia, cheque N°…, vale vista…' })}
          <div><label className="etiqueta" htmlFor="fin-uf">UF a la fecha de término</label><input id="fin-uf" inputMode="decimal" value={ufTxt} onChange={(e) => setUfTxt(e.target.value)} className="campo num" /></div>
        </section>

        <section className="tarjeta space-y-3 p-4 text-sm">
          <h2 className="font-semibold">Base de cálculo y ajustes</h2>
          <div className="flex flex-wrap gap-4 text-xs"><span className="text-tenue">Última remuneración (Art. 172) incluye:</span>{ck('incGrat', 'Gratificación mensual')}{ck('incColacion', 'Colación')}{ck('incMovilizacion', 'Movilización')}</div>
          <div className="grid gap-3 sm:grid-cols-4">
            {campo('baseManual', 'Última remuneración manual', { ph: 'Automática', ayuda: 'Remuneración variable: promedio de los últimos 3 meses' })}
            {campo('diasFeriadoManual', 'Días hábiles de feriado', { ph: 'Automático' })}
            {c.ias && campo('aniosManual', 'Años de indemnización', { ph: 'Automático' })}
            {c.ias && campo('afcManual', 'Descuento aporte AFC empleador', { ph: 'Estimado', ayuda: 'El legal es el del certificado de AFC Chile. Escribe 0 para no descontar' })}
          </div>
          <div className="text-xs">{ck('incMesTermino', 'Incluir la remuneración del mes de término (si no se paga en la liquidación mensual)')}</div>
          {f.incMesTermino && <div className="max-w-xs">{campo('montoMesTermino', 'Monto líquido del mes', { ph: 'Automático' })}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            {filasExtra('haberesExtra', 'Otros haberes', '+ Haber')}
            {filasExtra('descuentosExtra', 'Otros descuentos (anticipos, préstamos…)', '+ Descuento')}
          </div>
        </section>

        <section className="tarjeta space-y-3 p-4 text-sm">
          <h2 className="font-semibold">Texto del finiquito</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64"><label className="etiqueta" htmlFor="fin-plantilla">Plantilla</label>
              <select id="fin-plantilla" value={f.plantillaId || ''} onChange={(e) => set({ plantillaId: e.target.value })} className="campo">
                <option value="">Según la causal ({plDef?.nombre || ''})</option>
                {datos.plantillas.map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.tipo ? '' : ' · propia'}</option>)}
              </select></div>
            <button type="button" className="boton-sec" onClick={() => { if (!texto) setTexto(textoEfectivo); setEditTexto(true); }}>{texto ? '✏️ Editar texto propio' : '✏️ Personalizar texto'}</button>
            <label className="boton-sec cursor-pointer">📤 Subir archivo<input type="file" accept=".txt,.docx,.md,.html,.htm" className="sr-only" onChange={(e) => { subir(e.target.files?.[0]); e.target.value = ''; }} /></label>
            {texto && <button type="button" className="text-xs text-peligro hover:underline" onClick={() => { setTexto(''); setEditTexto(false); }}>Volver a la plantilla</button>}
          </div>
          <p className="text-xs text-tenue">{texto ? '✅ Este finiquito usa un texto propio.' : 'Archivos .docx, .txt, .md o .html. Pueden traer marcadores como {{trabajador}} o {{total}}.'}</p>
          {editTexto && (
            <div>
              <textarea aria-label="Texto del finiquito" rows={16} value={texto || textoEfectivo} onChange={(e) => setTexto(e.target.value)} className="campo num w-full text-xs leading-relaxed" />
              <p className="mt-1 text-[10px] leading-relaxed text-tenue">Marcadores: {MARCADORES.map(([k, d]) => <code key={k} title={d} className="mr-1 cursor-pointer hover:text-acento" onClick={() => setTexto((x) => (x || textoEfectivo) + `{{${k}}}`)}>{`{{${k}}}`}</code>)}</p>
            </div>
          )}
        </section>

        <section className="tarjeta flex flex-wrap items-center gap-4 p-4 text-xs">
          <label className="flex items-center gap-2"><input type="checkbox" checked={!!f.actualizarFicha} onChange={(e) => set({ actualizarFicha: e.target.checked })} /> Registrar fecha y causal de término en la ficha del trabajador (LRE y Previred)</label>
          <span className="flex items-center gap-2">Código causal LRE <input aria-label="Código causal LRE" value={f.codigoLRE || ''} onChange={(e) => set({ codigoLRE: e.target.value })} className="campo num w-20" inputMode="numeric" /></span>
        </section>
        <div className="flex gap-2">
          <button type="button" className="boton" disabled={pendiente || !r || !r.ok} onClick={guardar}>{pendiente ? 'Guardando…' : '💾 Guardar y ver documento'}</button>
        </div>
        <Mensaje {...msg} />
      </div>

      <aside className="tarjeta h-fit space-y-2 p-4 text-xs xl:sticky xl:top-4">
        <h2 className="text-sm font-semibold">Vista previa del cálculo</h2>
        {!r ? <p className="text-tenue">Selecciona un trabajador.</p> : !r.ok ? <p className="text-aviso">⚠️ {r.motivo}</p> : (
          <>
            <p className="text-tenue">Antigüedad {r.ant.anios} año(s), {r.ant.meses} mes(es) y {r.ant.dias} día(s) · última remuneración {clp(r.ultimaRem)}{r.baseIndem < r.ultimaRem ? ` (tope 90 UF ${clp(r.tope90)})` : ''}</p>
            <table className="w-full">
              <tbody>
                {r.lineas.map((x, i) => <tr key={i} className="border-b border-borde/30"><td className="py-1 pr-2">{x.d}</td><td className="num text-right whitespace-nowrap">{clp(x.m)}</td></tr>)}
                <tr className="font-semibold"><td className="py-1">Total haberes</td><td className="num text-right">{clp(r.totalHaberes)}</td></tr>
                {r.desc.map((x, i) => <tr key={i} className="border-b border-borde/30"><td className="py-1 pr-2">Menos {x.d}</td><td className="num text-right text-peligro whitespace-nowrap">-{clp(x.m)}</td></tr>)}
                <tr className="border-t border-borde text-sm font-semibold"><td className="py-1.5">Total a pagar</td><td className="num text-right text-acento" data-total>{clp(r.total)}</td></tr>
              </tbody>
            </table>
            <p className="text-tenue">Feriado: saldo {r.feriado.saldo == null ? '–' : n2(r.feriado.saldo)} + proporcional {n2(r.feriado.fraccion)} = {n2(r.feriado.habilesCalc)} días hábiles · {n2(r.feriado.corridos)} corridos (hasta {fechaCL(r.feriado.hasta)}) · diario {clp(r.feriado.diario)}</p>
            {r.avisos.map((a, i) => <p key={i} className="text-aviso">⚠️ {a}</p>)}
            <p className="text-[10px] text-tenue">Las indemnizaciones por término y el feriado compensado al término no son imponibles ni tributables (Art. 178).</p>
          </>
        )}
      </aside>
    </div>
  );
}
