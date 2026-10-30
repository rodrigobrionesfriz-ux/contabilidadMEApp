'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { CuentaBase } from '@/motor/plan-cuentas';
import type { PlanCarga } from '@/importador/respaldo';
import { crearClienteNavegador } from '@/lib/supabase/client';
import { clp } from '@/lib/formato';
import { rutParse } from '@/motor/rut';

type Etapa = 'inicio' | 'revisar' | 'cargando' | 'listo';
interface Existente { asientos: number; importados: number; propios: number; documentos: number; f29: number; rcv: number; libros_rem: number; anticipos: number; meses_cerrados: number }
interface Verificacion { ok: boolean; diferencias: { cuenta: string; esperado: number; base: number }[] }

const mismoRut = (a: string, b: string) => rutParse(a).raw === rutParse(b).raw;

export function Importador({ empresaId, rutEmpresa, pdc }: { empresaId: string; rutEmpresa: string; pdc: CuentaBase[] }) {
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>('inicio');
  const [archivo, setArchivo] = useState('');
  const [plan, setPlan] = useState<PlanCarga | null>(null);
  const [error, setError] = useState('');
  const [avance, setAvance] = useState({ hecho: 0, total: 1, texto: '' });
  const [verif, setVerif] = useState<Verificacion | null>(null);
  // Lo que ya tiene el año en esta empresa: se borra al importar (el respaldo reemplaza el año)
  const [existente, setExistente] = useState<Existente | null>(null);
  const [acepto, setAcepto] = useState(false);

  async function leer(f: File) {
    setError(''); setPlan(null); setVerif(null); setExistente(null); setAcepto(false);
    try {
      const [{ leerRespaldo }, { construirPlanCarga }] = await Promise.all([import('@/importador/leer-excel'), import('@/importador/respaldo')]);
      const p = construirPlanCarga(leerRespaldo(new Uint8Array(await f.arrayBuffer())), pdc);
      setArchivo(f.name); setPlan(p); setEtapa('revisar');
      if (p.anio) {
        const r = await crearClienteNavegador().rpc('resumen_anio', { p_empresa: empresaId, p_anio: p.anio });
        if (r.error) throw r.error;
        setExistente(r.data as Existente);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function importar() {
    if (!plan) return;
    const { enLotes } = await import('@/importador/respaldo');
    const sb = crearClienteNavegador();
    const lotesA = enLotes(plan.asientos, 200);
    const lotesD = enLotes(plan.documentos, 300);
    const total = 2 + lotesA.length + lotesD.length;
    let hecho = 0;
    const paso = (texto: string) => setAvance({ hecho: ++hecho, total, texto });
    setEtapa('cargando'); setError('');
    try {
      setAvance({ hecho: 0, total, texto: 'Preparando cuentas y centros de costo…' });
      const ini = await sb.rpc('importar_iniciar', { p_empresa: empresaId, p_anio: plan.anio, p_archivo: archivo, p_cuentas: plan.cuentas, p_centros: plan.centros });
      if (ini.error) throw ini.error;
      const id = ini.data as string;
      paso('Cargando asientos…');
      for (const [i, lote] of lotesA.entries()) {
        const r = await sb.rpc('importar_asientos', { p_importacion: id, p_asientos: lote });
        if (r.error) throw r.error;
        paso(`Asientos: ${Math.min((i + 1) * 200, plan.asientos.length)} de ${plan.asientos.length}`);
      }
      for (const lote of lotesD) {
        const r = await sb.rpc('importar_documentos', { p_importacion: id, p_docs: lote });
        if (r.error) throw r.error;
        paso('Cargando documentos…');
      }
      const fin = await sb.rpc('importar_finalizar', { p_importacion: id, p_cierres: plan.cierres, p_resumen: plan.resumen });
      if (fin.error) throw fin.error;
      paso('Verificando…');
      const bal = await sb.rpc('balance_comprobacion', { p_empresa: empresaId, p_desde: `${plan.anio}-01-01`, p_hasta: `${plan.anio}-12-31` });
      if (bal.error) throw bal.error;
      const enBase = new Map((bal.data as { cuenta: string; debe: number; haber: number }[]).map((f) => [f.cuenta, Number(f.debe) - Number(f.haber)]));
      const cuentas = new Set([...enBase.keys(), ...Object.keys(plan.totales)]);
      const diferencias = [...cuentas].map((cd) => {
        const t = plan.totales[cd];
        return { cuenta: cd, esperado: t ? t.debe - t.haber : 0, base: enBase.get(cd) ?? 0 };
      }).filter((d) => d.esperado !== d.base);
      setVerif({ ok: diferencias.length === 0, diferencias });
      setEtapa('listo');
      router.refresh();
    } catch (e) {
      const msg = (e as { message?: string }).message ?? String(e);
      setError(`${msg.replace(/\.$/, '')}. Si la carga quedó a medias, vuelve a importar el respaldo: se reemplaza el año ${plan.anio} completo.`);
      setEtapa('revisar');
      router.refresh();
    }
  }

  const errores = plan?.problemas.filter((p) => p.nivel === 'error') ?? [];
  const avisos = plan?.problemas.filter((p) => p.nivel === 'aviso') ?? [];
  const rutDistinto = plan && plan.empresa.rut && !mismoRut(plan.empresa.rut, rutEmpresa);

  return (
    <section className="tarjeta space-y-4 p-5">
      {(etapa === 'inicio' || etapa === 'revisar') && (
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-borde p-6 text-center hover:border-acento">
          <span className="text-2xl">📄</span>
          <span className="text-sm">{archivo ? `Archivo: ${archivo} (elige otro para cambiarlo)` : 'Elige el respaldo .xlsx'}</span>
          <input type="file" accept=".xlsx" className="sr-only" onChange={(e) => e.target.files?.[0] && leer(e.target.files[0])} />
        </label>
      )}
      {error && <p role="alert" className="rounded-md border border-peligro/40 bg-peligro/10 px-3 py-2 text-sm text-peligro">{error}</p>}

      {plan && etapa === 'revisar' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ['Empresa', `${plan.empresa.nombre || '—'}`],
              ['Año', String(plan.anio || '—')],
              ['Asientos', `${plan.resumen.asientos} (${plan.resumen.generados} generados)`],
              ['Total debe', clp(plan.resumen.debe)],
            ].map(([t, v]) => (
              <div key={t} className="rounded-md bg-panel-2 p-3">
                <div className="text-xs text-tenue uppercase">{t}</div>
                <div className="num mt-1 truncate font-semibold">{v}</div>
              </div>
            ))}
          </div>
          <p className="text-sm text-tenue">
            {plan.resumen.documentos} documentos · {plan.resumen.anulados} anulados · {plan.cuentas.length} cuentas propias nuevas ·{' '}
            {plan.centros.length} centros de costo · {plan.cierres.length} meses cerrados
          </p>
          {rutDistinto && (
            <p className="rounded-md border border-aviso/40 bg-aviso/10 px-3 py-2 text-sm text-aviso">
              ⚠️ El respaldo es del RUT {plan.empresa.rut} y esta empresa es {rutEmpresa}. Revisa que sea el archivo correcto.
            </p>
          )}
          {errores.length > 0 && (
            <div className="rounded-md border border-peligro/40 bg-peligro/10 p-3 text-sm">
              <div className="mb-1 font-semibold text-peligro">{errores.length} problema(s) impiden importar. Corrígelos en el sistema anterior y exporta de nuevo:</div>
              <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5">{errores.map((p, i) => <li key={i}>{p.mensaje}</li>)}</ul>
            </div>
          )}
          {avisos.length > 0 && (
            <details className="rounded-md border border-borde p-3 text-sm">
              <summary className="cursor-pointer text-aviso">{avisos.length} aviso(s), no impiden importar</summary>
              <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-tenue">{avisos.map((p, i) => <li key={i}>{p.mensaje}</li>)}</ul>
            </details>
          )}
          {existente && (existente.asientos > 0 || existente.documentos > 0 || existente.f29 > 0 || existente.rcv > 0 || existente.libros_rem > 0) ? (
            <div className="space-y-2 rounded-md border border-peligro/40 bg-peligro/10 p-3 text-sm">
              <div className="font-semibold text-peligro">⚠️ El respaldo reemplaza el año {plan.anio} completo. Antes de cargarlo se borrará lo que esta empresa tiene en {plan.anio}:</div>
              <ul className="list-disc pl-5">
                <li>{existente.asientos} asientos ({existente.importados} importados antes{existente.propios ? <>, <b>{existente.propios} registrados en esta app</b></> : ''}) y {existente.documentos} documentos de compras, ventas y honorarios.</li>
                {(existente.f29 > 0 || existente.rcv > 0) && <li>{existente.f29} F29 guardados y {existente.rcv} RCV cargados.</li>}
                {(existente.libros_rem > 0 || existente.anticipos > 0) && <li>{existente.libros_rem} libros de remuneraciones cerrados y {existente.anticipos} anticipos.</li>}
                {existente.meses_cerrados > 0 && <li>{existente.meses_cerrados} meses cerrados (quedan como vengan en el respaldo).</li>}
                <li>También la conciliación bancaria y el cierre del ejercicio {plan.anio}.</li>
              </ul>
              <p className="text-tenue">Se conservan los otros años, el plan de cuentas, los centros de costo, las fichas de proveedores y clientes, los trabajadores y los activos fijos. No se puede deshacer: si hace falta, primero exporta a Excel.</p>
              <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} />
                <span>Entiendo que se borra todo lo del año {plan.anio} en esta empresa y se reemplaza por el respaldo.</span></label>
            </div>
          ) : existente && <p className="text-sm text-tenue">El año {plan.anio} está vacío en esta empresa.</p>}
          <button type="button" className="boton" onClick={importar}
            disabled={errores.length > 0 || !plan.asientos.length || !existente || (!acepto && (existente.asientos > 0 || existente.documentos > 0 || existente.f29 > 0 || existente.rcv > 0 || existente.libros_rem > 0))}>
            {existente && existente.asientos > 0 ? `Reemplazar el año ${plan.anio} con el respaldo` : `Importar año ${plan.anio}`}
          </button>
        </div>
      )}

      {etapa === 'cargando' && (
        <div className="space-y-2">
          <div className="text-sm">{avance.texto}</div>
          <div className="h-2 overflow-hidden rounded bg-panel-2">
            <div className="h-full bg-acento transition-all" style={{ width: `${Math.round((avance.hecho / avance.total) * 100)}%` }} />
          </div>
          <p className="text-xs text-tenue">No cierres esta pestaña hasta que termine.</p>
        </div>
      )}

      {etapa === 'listo' && plan && verif && (
        <div className="space-y-3">
          {verif.ok ? (
            <p role="status" className="rounded-md border border-acento/40 bg-acento/10 px-3 py-2 text-sm text-acento">
              ✓ Año {plan.anio} importado: {plan.resumen.asientos} asientos y {plan.resumen.documentos} documentos. El saldo de todas las cuentas coincide con el respaldo.
            </p>
          ) : (
            <div className="rounded-md border border-peligro/40 bg-peligro/10 p-3 text-sm text-peligro">
              El año se importó, pero {verif.diferencias.length} cuenta(s) no coinciden con el respaldo:
              <ul className="mt-1 list-disc pl-5">{verif.diferencias.map((d) => <li key={d.cuenta} className="num">{d.cuenta}: respaldo {clp(d.esperado)} · base {clp(d.base)}</li>)}</ul>
            </div>
          )}
          <div className="flex gap-2">
            <Link href={`/e/${empresaId}/balance?anio=${plan.anio}`} className="boton">Ver balance {plan.anio}</Link>
            <button type="button" className="boton-sec" onClick={() => { setEtapa('inicio'); setPlan(null); setArchivo(''); }}>Importar otro año</button>
          </div>
        </div>
      )}
    </section>
  );
}
