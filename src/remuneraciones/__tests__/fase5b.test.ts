import { describe, it, expect } from 'vitest';
import oro from '../__fixtures__/b5-oro.json';
import { liquidacionMes, type Trabajador, type EventoAsistencia, type ContextoRem } from '../calculo';
import { parametrosVigentes, type Patronal } from '../parametros';
import { lineaLibro, type LineaLibro } from '../libro';
import { construirRegistroLRE, validarLibroLRE, LRE_CONCEPTOS, textoLRE, aWindows1252 } from '../lre';
import { construirPrevired, textoArchivoPrevired } from '../previred';
import { feriadosAnio, esFeriado, diasHabiles, progresivos, saldoVacaciones, leerFeriadosTexto, textoFeriados, type CfgFeriados } from '../vacaciones';
import { calcularFiniquito, habilesACorridos, antiguedad, aniosIndemnizacion, valoresMarcadores, PLANTILLAS_TIPO, CAUSALES, combinar, bloquesDocumento, propuestaAsiento, type FiniquitoOk, type CuentaPlan } from '../finiquito';

/* eslint-disable @typescript-eslint/no-explicit-any */
const o = oro as any;
const T = o.trabajadores as Trabajador[];
const ev = o.asistencia.eventos as EventoAsistencia[];
const P = parametrosVigentes();
const ctx: ContextoRem = { P, eventos: ev, horas: o.asistencia.horas, libros: {} };
const cfgF = o.empresa.feriados as CfgFeriados;
const limpio = (x: unknown) => JSON.parse(JSON.stringify(x));
const sinNbsp = (s: string) => s.replace(/\$ /g, '$');

describe('libro del mes (base de LRE y Previred)', () => {
  it('las líneas coinciden con el sistema actual', () => {
    const lineas = T.map((t) => lineaLibro(t, liquidacionMes(t, o.uf, o.utm, 2026, 3, ctx), '2026-03'));
    expect(limpio(lineas)).toEqual(o.lineas);
  });
});

describe('LRE (Dirección del Trabajo)', () => {
  const lineas = o.lineas as LineaLibro[];
  const perfiles = Object.fromEntries(T.map((t) => [t.id, t.lre || {}]));
  it('encabezados oficiales en orden', () => expect(LRE_CONCEPTOS.map((c) => c.header)).toEqual(o.lre.headers));
  it('registro por trabajador idéntico', () => {
    lineas.forEach((l, i) => expect(construirRegistroLRE(l, P.patronal, perfiles[l.id])).toEqual(o.lre.registros[i]));
  });
  it('validación provisoria y cerrada', () => {
    expect(validarLibroLRE(lineas, P.patronal, false, perfiles)).toEqual(o.lre.validacion);
    expect(validarLibroLRE(lineas, P.patronal, true, perfiles)).toEqual(o.lreCerrado);
  });
  it('un dato vacío en la foto del libro no tapa el completado después en la ficha', () => {
    const l = { ...lineas[0], lre: { ...lineas[0].lre, region: '', comuna: '' } };
    const r = construirRegistroLRE({ ...l, lre: { ...l.lre, fechaTermino: '' } }, P.patronal, { region: '9', comuna: '9201', fechaTermino: '2026-10-16', causalTermino: '6' });
    expect([r['1105'], r['1106'], r['1103'], r['1104']]).toEqual(['9', '9201', '', '']);
  });
  it('CSV con CRLF y bytes ANSI', () => {
    const txt = textoLRE(lineas.slice(0, 1), P.patronal, perfiles);
    expect(txt.split('\r\n')).toHaveLength(3);
    const b = aWindows1252('Ñuñoa — año');
    expect([...b]).toEqual([0xD1, 0x75, 0xF1, 0x6F, 0x61, 0x20, 0x97, 0x20, 0x61, 0xF1, 0x6F]);
  });
});

describe('Previred (formato 58)', () => {
  const casos: [string, Patronal, boolean][] = [['sin caja', P.patronal, false], ['cerrado con caja y ACHS', o.patronal2, true]];
  for (const [nombre, patronal, cerrado] of casos) {
    it(nombre, () => {
      const g = o.previred.find((x: any) => x.caso === nombre);
      const r = construirPrevired({ anio: 2026, mes: 3, lineas: o.lineas, cerrado, uf: o.uf, trabajadores: T, eventos: ev, patronal,
        topeAFP_UF: +P.ind.topeAFP_UF!, rutEmpresa: o.empresa.rut, cfg: o.empresa.previred });
      expect(r.errores).toEqual(g.errores);
      expect(r.advertencias).toEqual(g.advertencias);
      expect(r.nombre).toBe(g.nombre);
      expect(r.lineas.map((x) => ({ trabajador: x.trabajador, tipo: x.tipo, campos: x.campos }))).toEqual(g.lineas);
      expect(textoArchivoPrevired(r)).toBe(g.texto);
    });
  }
});

describe('feriados y vacaciones', () => {
  it('feriados nacionales por año', () => {
    for (const [y, lista] of Object.entries(o.feriados)) expect([...feriadosAnio(+y).entries()]).toEqual(lista);
  });
  it('feriados adicionales y quitados', () => {
    for (const [f, nm] of o.esFeriado) expect(esFeriado(f, cfgF)).toBe(nm);
  });
  it('días hábiles y progresivos', () => {
    for (const [a, b, r] of o.habiles) expect(diasHabiles(a, b, cfgF)).toEqual(r);
    for (const [a, p, r] of o.progresivos) expect(progresivos(a, p)).toBe(r);
  });
  it('saldos por trabajador y fecha de corte', () => {
    for (const c of o.vacaciones) expect(limpio(saldoVacaciones(T.find((t) => t.id === c.trab)!, c.corte, ev, cfgF))).toEqual(c.s);
  });
  it('texto de feriados ida y vuelta', () => {
    const r = leerFeriadosTexto('2026-11-03 Elecciones\n- 2026-10-31\n2026-12-24\nmalo');
    expect(r.extra).toEqual([{ fecha: '2026-11-03', nombre: 'Elecciones' }, { fecha: '2026-12-24', nombre: 'Feriado' }]);
    expect(r.quitar).toEqual(['2026-10-31']); expect(r.malos).toEqual(['malo']);
    expect(textoFeriados(r)).toBe('2026-11-03 Elecciones\n2026-12-24 Feriado\n- 2026-10-31');
  });
});

describe('finiquitos', () => {
  for (const f of o.finiquitos) {
    it(f.id, () => {
      const r = calcularFiniquito(T.find((t) => t.id === f.trab)!, { uf: o.uf, ...f.inp }, { ctx, utm: o.utm, feriados: cfgF });
      if (!f.r.ok) { expect(r).toEqual(f.r); return; }
      const c = limpio(r);
      // Avisos: los del sistema actual, más el aviso nuevo de saldo sobre dos períodos
      expect(c.avisos.slice(0, f.r.avisos.length)).toEqual(f.r.avisos.map(sinNbsp));
      expect(c.avisos.slice(f.r.avisos.length).every((a: string) => a.startsWith('El saldo de vacaciones'))).toBe(true);
      delete c.avisos; delete c.baseCes; const g = { ...f.r }; delete g.avisos;
      g.lineas = g.lineas.map((l: any) => ({ ...l, d: sinNbsp(l.d) }));
      expect(c).toEqual(g);
    });
  }
  it('días corridos, antigüedad y años de indemnización', () => {
    for (const [fe, h, r] of o.habilesACorridos) expect(habilesACorridos(fe, h, cfgF)).toEqual(r);
    for (const [a, b, an, ai] of o.antiguedad) { expect(antiguedad(a, b)).toEqual(an); expect(limpio(aniosIndemnizacion(a, b))).toEqual(ai); }
  });
  it('plantillas, causales y marcadores', () => {
    expect(PLANTILLAS_TIPO).toEqual(o.plantillas);
    expect(CAUSALES).toEqual(o.causales);
    const f0 = o.finiquitos[1]; const t2 = T[1];
    const r = calcularFiniquito(t2, { uf: o.uf, ...f0.inp }, { ctx, utm: o.utm, feriados: cfgF }) as FiniquitoOk;
    const v = valoresMarcadores({ ...f0.inp, fecha: '2026-04-20', ciudad: 'Angol', formaPago: '', hechos: 'Reestructuración del área' }, t2, r, {});
    const g = Object.fromEntries(Object.entries(o.marcadores).map(([k, x]) => [k, sinNbsp(String(x))]));
    for (const k of Object.keys(v)) if (!['empresa', 'rut_empresa', 'domicilio_empresa', 'representante', 'rut_representante'].includes(k)) expect(v[k], k).toBe(g[k]);
    const b = bloquesDocumento(PLANTILLAS_TIPO[4].texto, v, r);
    expect(b[0]).toEqual({ tipo: 'titulo', texto: 'FINIQUITO DE CONTRATO DE TRABAJO' });
    expect(b.some((x) => x.tipo === 'detalle')).toBe(true);
    expect(b.find((x) => x.tipo === 'parrafo' && x.rotulo === 'SEGUNDO:')).toBeTruthy();
    expect(combinar('{{trabajador}} {{otro}}', v)).toBe('Beto Alto Ruiz {{otro}}');
  });
  it('asiento del finiquito: provisión, descuento AFC y cuadratura', () => {
    const r = calcularFiniquito(T[4], { uf: o.uf, ...o.finiquitos[3].inp }, { ctx, utm: o.utm, feriados: cfgF }) as FiniquitoOk;
    const cta = (codigo: string, aux: string | null = null): [string, CuentaPlan] => [codigo, { codigo, acepta_movimientos: true, acepta_centro_costo: codigo.startsWith('3'), tipo_auxiliar: aux }];
    const plan = new Map([cta('3201011'), cta('3201009'), cta('3201014'), cta('1106001'), cta('2104005'), cta('2105004'), cta('2202001')]);
    const a = propuestaAsiento('Eli', '55555555-5', r, { fecha: '2026-10-16', cc: 'CC1', usarProv: { feriado: true } }, plan, { '2105004': 1000000 });
    expect(a.errores).toEqual([]);
    expect(a.debe).toBe(a.haber);
    expect(a.movs.find((m) => m.cuenta === '2105004')?.debe).toBe(1000000);
    expect(a.movs.find((m) => m.k === 'afc')).toMatchObject({ cuenta: '3201009', haber: 120000 });
    expect(a.movs.find((m) => m.k === 'pagar')?.haber).toBe(r.total);
    expect(a.movs.find((m) => m.cuenta === '3201011')?.centro_costo).toBe('CC1');
  });
});
