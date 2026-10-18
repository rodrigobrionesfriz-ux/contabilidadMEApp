'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { liquidacionMes, CONTRATOS_AFC, type Trabajador, type ContextoRem } from '@/remuneraciones/calculo';
import { rutParse } from '@/motor/rut';
import { clp, MESES, decimalCL, decimalTexto } from '@/lib/formato';
import { Mensaje } from '@/components/form-estado';
import { guardarTrabajador } from '../../acciones';

type Ficha = Omit<Trabajador, 'id' | 'rut' | 'nombre'> & { lre: NonNullable<Trabajador['lre']> };
const FICHA_VACIA: Ficha = {
  cargo: '', apellidoPaterno: '', apellidoMaterno: '', nombres: '', sexo: '', nacionalidad: '0', tipoTrabajador: '0', numeroFUN: '',
  base: 0, tipoPago: 'mensual', valorHora: 0, horasMes: 0, gratifModo: 'pct', gratifPct: 25, grat: 0, otros: 0, colacion: 0, movilizacion: 0,
  afp: 'habitat', salud: 'fonasa', plan: 0, contrato: 'indefinido',
  lre: { fechaInicio: '', fechaTermino: '', causalTermino: '', region: '', comuna: '', tipoImpuesto: '1', jornada: '101', cargasLegales: '', cargasMaternales: '', cargasInvalidez: '', tramoAsignacion: '', puestoPesado: '', nombrePuestoPesado: '', rentaMinima: 'general' },
};

export function FormTrabajador({ empresaId, trabajador, ctx, uf, utm, anio, mes, escribe }: {
  empresaId: string; trabajador: (Trabajador & { activo: boolean }) | null; ctx: ContextoRem; uf: number; utm: number; anio: number; mes: number; escribe: boolean;
}) {
  const router = useRouter();
  const [rut, setRut] = useState(trabajador?.rut ?? '');
  const [nombre, setNombre] = useState(trabajador?.nombre ?? '');
  const [activo, setActivo] = useState(trabajador?.activo ?? true);
  const [f, setF] = useState<Ficha>(() => {
    if (!trabajador) return FICHA_VACIA;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, rut: _r, nombre: _n, activo: _a, anticipos: _x, ...resto } = trabajador;
    return { ...FICHA_VACIA, ...resto, lre: { ...FICHA_VACIA.lre, ...(trabajador.lre ?? {}) } };
  });
  const [msg, setMsg] = useState<{ error?: string; ok?: string }>({});
  const [pendiente, iniciar] = useTransition();
  const set = (k: keyof Ficha, v: unknown) => setF((x) => ({ ...x, [k]: v }));
  const setL = (k: string, v: string) => setF((x) => ({ ...x, lre: { ...x.lre, [k]: v } }));
  const r = rutParse(rut);
  const liq = useMemo(() => {
    try {
      const t = { ...f, id: trabajador?.id ?? 'nuevo', rut, nombre, anticipos: trabajador?.anticipos ?? [] } as Trabajador;
      return liquidacionMes(t, uf, utm, anio, mes, ctx);
    } catch { return null; }
  }, [f, rut, nombre, trabajador, uf, utm, anio, mes, ctx]);
  const num = (v: string) => Math.round(Number(v.replace(/\./g, '').replace(',', '.')) || 0);
  const [txt, setTxt] = useState<Record<string, string>>({});

  const C = ({ k, l, tipo = 'monto', disabled }: { k: keyof Ficha; l: string; tipo?: 'monto' | 'texto' | 'dec'; disabled?: boolean }) => (
    <div>
      <label className="etiqueta" htmlFor={`f-${String(k)}`}>{l}</label>
      <input id={`f-${String(k)}`} disabled={disabled || !escribe} inputMode={tipo === 'texto' ? undefined : 'decimal'}
        value={tipo === 'texto' ? String(f[k] ?? '') : tipo === 'dec' ? (txt[k] ?? decimalTexto(f[k] as number)) : (f[k] as number) || ''}
        onChange={(e) => set(k, tipo === 'texto' ? e.target.value : tipo === 'dec' ? (setTxt((x) => ({ ...x, [k]: e.target.value })), decimalCL(e.target.value)) : num(e.target.value))}
        className={`campo ${tipo !== 'texto' ? 'num text-right' : ''}`} />
    </div>
  );
  const S = ({ k, l, ops, lre }: { k: string; l: string; ops: [string, string][]; lre?: boolean }) => (
    <div>
      <label className="etiqueta" htmlFor={`s-${k}`}>{l}</label>
      <select id={`s-${k}`} disabled={!escribe} value={String((lre ? f.lre[k] : (f as Record<string, unknown>)[k]) ?? '')}
        onChange={(e) => (lre ? setL(k, e.target.value) : set(k as keyof Ficha, e.target.value))} className="campo">
        {ops.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
      </select>
    </div>
  );
  const Lc = ({ k, l, tipo = 'text' }: { k: string; l: string; tipo?: string }) => (
    <div>
      <label className="etiqueta" htmlFor={`l-${k}`}>{l}</label>
      <input id={`l-${k}`} type={tipo} disabled={!escribe} value={String(f.lre[k] ?? '')} onChange={(e) => setL(k, e.target.value)} className="campo" />
    </div>
  );

  function guardar() {
    setMsg({});
    iniciar(async () => {
      const res = await guardarTrabajador(empresaId, trabajador?.id ?? null, rut, nombre, activo, f as Record<string, unknown>);
      if (!res.ok) return setMsg({ error: res.error });
      setMsg({ ok: res.mensaje });
      if (!trabajador && res.id) router.replace(`/e/${empresaId}/remuneraciones/trabajador/${res.id}`);
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <section className="tarjeta grid gap-3 p-4 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">Identificación</h2>
          <div>
            <label className="etiqueta" htmlFor="rut">RUT</label>
            <input id="rut" value={rut} disabled={!!trabajador || !escribe} onChange={(e) => setRut(e.target.value)} className={`campo num ${rut && !r.valido ? 'border-peligro' : ''}`} />
          </div>
          <div className="sm:col-span-2"><label className="etiqueta" htmlFor="nombre">Nombre completo</label><input id="nombre" value={nombre} disabled={!escribe} onChange={(e) => setNombre(e.target.value)} className="campo" /></div>
          {C({ k: "nombres", l: "Nombres", tipo: "texto" })}{C({ k: "apellidoPaterno", l: "Apellido paterno", tipo: "texto" })}{C({ k: "apellidoMaterno", l: "Apellido materno", tipo: "texto" })}
          {S({ k: "sexo", l: "Sexo", ops: [['', '—'], ['M', 'Masculino'], ['F', 'Femenino']] })}
          {S({ k: "nacionalidad", l: "Nacionalidad", ops: [['0', 'Chilena'], ['1', 'Extranjera']] })}
          {C({ k: "cargo", l: "Cargo", tipo: "texto" })}
          {S({ k: "tipoTrabajador", l: "Tipo de trabajador", ops: [['0', 'Activo (no pensionado)'], ['1', 'Pensionado y cotiza'], ['2', 'Pensionado y no cotiza'], ['3', 'Activo mayor de 65 (nunca pensionado)']] })}
          <label className="flex items-end gap-2 pb-2 text-sm"><input type="checkbox" checked={activo} disabled={!escribe} onChange={(e) => setActivo(e.target.checked)} /> Activo</label>
        </section>

        <section className="tarjeta grid gap-3 p-4 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">Contrato</h2>
          {S({ k: "contrato", l: "Tipo de contrato (AFC)", ops: CONTRATOS_AFC.map((c) => [c.k, c.nm]) })}
          {Lc({ k: "fechaInicio", l: "Fecha de inicio", tipo: "date" })}{Lc({ k: "fechaTermino", l: "Fecha de término", tipo: "date" })}
          {f.lre.fechaTermino && Lc({ k: "causalTermino", l: "Causal de término (código LRE)", tipo: "number" })}
          {S({ lre: true, k: "jornada", l: "Jornada", ops: [['101', 'Completa'], ['201', 'Parcial'], ['301', 'Excepcional / bisemanal']] })}
          {Lc({ k: "region", l: "Región (código)" })}{Lc({ k: "comuna", l: "Comuna (código)" })}
        </section>

        <section className="tarjeta grid gap-3 p-4 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">Remuneración</h2>
          {S({ k: "tipoPago", l: "Forma de pago", ops: [['mensual', 'Sueldo mensual'], ['hora', 'Por hora']] })}
          {f.tipoPago === 'hora' ? (<>{C({ k: "valorHora", l: "Valor hora" })}{C({ k: "horasMes", l: "Horas habituales al mes", tipo: "dec" })}</>) : (<>{C({ k: "base", l: "Sueldo base" })}<div /></>)}
          {S({ k: "gratifModo", l: "Gratificación", ops: [['pct', 'Legal (% con tope Art. 50)'], ['monto', 'Monto pactado']] })}
          {f.gratifModo === 'pct' ? C({ k: "gratifPct", l: "% gratificación", tipo: "dec" }) : C({ k: "grat", l: "Monto gratificación" })}
          {C({ k: "otros", l: "Otros haberes imponibles" })}
          {C({ k: "colacion", l: "Colación" })}{C({ k: "movilizacion", l: "Movilización" })}
          {S({ lre: true, k: "rentaMinima", l: "Renta mínima", ops: [['general', 'General'], ['especial', 'Menores de 18 / mayores de 65'], ['casa', 'Casa particular']] })}
        </section>

        <section className="tarjeta grid gap-3 p-4 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">Previsión y cargas</h2>
          {S({ k: "afp", l: "AFP", ops: ctx.P.afps.map((a) => [a.k, `${a.nm} (${String(a.comision).replace('.', ',')}%)`]) })}
          {S({ k: "salud", l: "Salud", ops: ctx.P.isapres.map((i) => [i.k, i.nm]) })}
          {C({ k: "plan", l: "Plan Isapre (UF)", tipo: "dec", disabled: f.salud === 'fonasa' })}
          {f.salud !== 'fonasa' && C({ k: "numeroFUN", l: "N° FUN Isapre (Previred)", tipo: "texto" })}
          {Lc({ k: "cargasLegales", l: "Cargas simples", tipo: "number" })}{Lc({ k: "cargasMaternales", l: "Cargas maternales", tipo: "number" })}{Lc({ k: "cargasInvalidez", l: "Cargas inválidas", tipo: "number" })}
          {S({ lre: true, k: "tramoAsignacion", l: "Tramo asignación", ops: [['', 'Automático'], ['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D (sin derecho)']] })}
          {S({ lre: true, k: "puestoPesado", l: "Trabajo pesado", ops: [['', 'No'], ['pesado', 'Pesado (Ley 19.404)'], ['menos', 'Menos pesado']] })}
          {f.lre.puestoPesado && Lc({ k: "nombrePuestoPesado", l: "Nombre del puesto" })}
        </section>

        <div className="flex items-center gap-3">
          {escribe && <button type="button" className="boton" disabled={pendiente || !r.valido || !nombre.trim()} onClick={guardar}>{pendiente ? 'Guardando…' : 'Guardar ficha'}</button>}
          <Mensaje {...msg} />
        </div>
      </div>

      <aside className="tarjeta h-fit space-y-2 p-4 text-xs lg:sticky lg:top-4">
        <h2 className="text-sm font-semibold">Vista previa · {MESES[mes - 1]} {anio}</h2>
        {liq ? (
          <table className="w-full">
            <tbody>
              {([
                ['Días pagados', liq.porHora ? `${liq.horas} h` : liq.asis?.diasPagados],
                ['Sueldo base', clp(liq.base)], ['Gratificación', clp(liq.grat)], ['Otros imponibles', clp(liq.otros)],
                ['Total imponible', clp(liq.totalImponible)], ['Colación + movilización', clp(liq.colacion + liq.movilizacion)],
                ['Asignación familiar', clp(liq.asigFamiliar)], [`AFP ${liq.afpNm}`, `-${clp(liq.descAFP)}`],
                [`Salud ${liq.saludNm}`, `-${clp(liq.descSalud)}`], ['Seguro cesantía', `-${clp(liq.descCesantia)}`],
                ['Impuesto único', `-${clp(liq.iusc)}`], ['Anticipos', liq.anticipo ? `-${clp(liq.anticipo)}` : clp(0)],
              ] as [string, string | number][]).map(([a, b]) => <tr key={a} className="border-b border-borde/30"><td className="py-0.5 text-tenue">{a}</td><td className="num text-right">{b}</td></tr>)}
              <tr className="font-semibold"><td className="py-1">Líquido</td><td className={`num text-right ${liq.liquido < 0 ? 'text-peligro' : 'text-acento'}`}>{clp(liq.liquido)}</td></tr>
              <tr><td className="text-tenue">Costo empresa</td><td className="num text-right">{clp(liq.costoEmpresa)}</td></tr>
            </tbody>
          </table>
        ) : <p className="text-tenue">Completa los datos para ver el cálculo.</p>}
      </aside>
    </div>
  );
}
