import { clp } from '@/lib/formato';

// Declaraciones juradas de renta: traslado de djcatalogo.js y djrenta.js del sistema actual.
// El catálogo oficial del AT 2026 es solo la semilla: cada empresa guarda su copia editable.

export const TODOS_REG = ['14A', '14D3', '14D8', '34AGRI', '34TRANS', '34MIN', 'NOSUJ'];
export const REG_DJ: [string, string][] = [
  ['14A', '14 A Semi Integrado'], ['14D3', '14 D N°3 Pro Pyme'], ['14D8', '14 D N°8 Transparente'],
  ['34AGRI', 'Presunta agrícola'], ['34TRANS', 'Presunta transporte'], ['34MIN', 'Presunta minería'], ['NOSUJ', 'No sujeto Art. 14'],
];

export interface DJ {
  n: string; nm: string; desc: string; plazo: string; plazoTxt?: string; regimenes: string[];
  fuente?: string; cert?: string; nota?: string; propia?: boolean;
}

export const DJ_SEMILLA: DJ[] = [
  { n: '1887', nm: 'Rentas del Art. 42 N°1 (sueldos)', desc: 'Sueldos, remuneraciones y retenciones de Impuesto Único de Segunda Categoría de cada trabajador.',
    plazo: '03-27', regimenes: TODOS_REG, fuente: 'sueldos', cert: 'Certificado N°6', nota: 'Sólo si hubo trabajadores con remuneración en el ejercicio.' },
  { n: '1879', nm: 'Retenciones del Art. 42 N°2 (honorarios)', desc: 'Honorarios pagados y retenciones practicadas a profesionales independientes.',
    plazo: '03-27', regimenes: TODOS_REG, fuente: 'honorarios', cert: 'Certificado N°1', nota: 'Sólo si se pagaron boletas de honorarios con retención.' },
  { n: '1847', nm: 'Balance de 8 columnas', desc: 'Balance tributario de ocho columnas del ejercicio.',
    plazo: '06-30', regimenes: ['14A', 'NOSUJ'], fuente: 'balance', nota: 'Contribuyentes obligados a llevar contabilidad completa.' },
  { n: '1926', nm: 'Base Imponible de Primera Categoría', desc: 'Ajustes al resultado del balance para llegar a la Renta Líquida Imponible y datos contables.',
    plazo: '06-30', regimenes: ['14A', 'NOSUJ'], fuente: 'rli', nota: 'Contribuyentes que declaran renta efectiva con contabilidad completa.' },
  { n: '1948', nm: 'Retiros, remesas y dividendos', desc: 'Retiros, remesas y dividendos distribuidos a los dueños, con sus créditos asociados.',
    plazo: '03-27', plazoTxt: '16, 24 o 27 de marzo según el tipo de propietario', regimenes: ['14A', '14D3'], cert: 'Certificado N°70',
    nota: 'S.A. abiertas al 16 de marzo · socios personas jurídicas al 24 · socios personas naturales al 27.' },
  { n: '1947', nm: 'Base imponible Pro Pyme Transparente', desc: 'Base imponible que se atribuye a los dueños, con sus créditos y PPM.',
    plazo: '03-27', plazoTxt: 'Junto con el Formulario 22', regimenes: ['14D8'], fuente: 'rli', cert: 'Certificado N°71',
    nota: 'La empresa no paga IDPC: son los dueños quienes declaran esta base.' },
  { n: '1943', nm: 'Contribuyentes acogidos a renta presunta', desc: 'Declaración anual de quienes tributan sobre renta presunta.',
    plazo: '03-27', regimenes: ['34AGRI', '34TRANS', '34MIN'], fuente: 'presunta' },
  { n: '1949', nm: 'Retiros y dividendos de renta presunta', desc: 'Retiros y dividendos de contribuyentes de renta presunta y del Art. 14 B.',
    plazo: '03-23', regimenes: ['34AGRI', '34TRANS', '34MIN'] },
];
export const djNueva = (): DJ => ({ n: '', nm: '', desc: '', plazo: '03-27', plazoTxt: '', regimenes: [], fuente: '', cert: '', nota: '', propia: true });

export const FUENTES: Record<string, string> = {
  sueldos: 'Libro de Remuneraciones', honorarios: 'Honorarios del ejercicio', rli: 'Declaración de Renta (RLI)',
  presunta: 'Declaración de Renta (renta presunta)', balance: 'Balance General',
};

const MESES_DJ = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function fechaLbl(dj: DJ, at?: number) {
  if (!dj.plazo) return '';
  const [m, d] = String(dj.plazo).split('-');
  return `${+d} de ${MESES_DJ[(+m || 1) - 1] || ''}${at ? ' de ' + at : ''}`;
}
export const plazoLbl = (dj: DJ, at?: number) => dj.plazoTxt || fechaLbl(dj, at) || 'sin plazo definido';
/** Fecha de vencimiento (AAAA-MM-DD) para el semáforo. */
export function fechaVence(dj: DJ, at: number) {
  if (!dj.plazo || !at) return null;
  const [m, d] = String(dj.plazo).split('-').map(Number);
  if (!m || !d) return null;
  return `${at}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
export const aplicaA = (dj: DJ, regimen: string) => Array.isArray(dj.regimenes) && dj.regimenes.includes(regimen);

/** Días hasta el vencimiento contados desde hoy (AAAA-MM-DD); negativo si ya venció. */
export function diasParaVencer(dj: DJ, at: number, hoy: string) {
  const v = fechaVence(dj, at);
  if (!v) return null;
  // El sistema actual vence a las 23:59:59 del día y redondea hacia arriba: el mismo día da 1.
  const ms = Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) - Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  return Math.round(ms / 86400000) + 1;
}

export const ESTADOS_DJ: Record<string, { lbl: string; tono: string }> = {
  pendiente: { lbl: 'Pendiente', tono: 'text-tenue' },
  preparada: { lbl: 'Preparada', tono: 'text-aviso' },
  presentada: { lbl: 'Presentada', tono: 'text-acento' },
  noaplica: { lbl: 'No aplica', tono: 'text-tenue' },
};
export interface EstadoDJ { estado: string; fecha: string; folio: string; obs: string }
export const estadoVacio = (): EstadoDJ => ({ estado: 'pendiente', fecha: '', folio: '', obs: '' });

/** Valida y arma una declaración del catálogo (guardarDJ). Devuelve el error o la declaración. */
export function validarDJ(x: Partial<DJ>, catalogo: DJ[], orig: string | null): { error: string } | { dj: DJ } {
  const n = String(x.n || '').trim();
  if (!n) return { error: 'Indica el número del formulario' };
  const nm = String(x.nm || '').trim();
  if (!nm) return { error: 'Ponle un nombre a la declaración' };
  const plazo = String(x.plazo || '').trim();
  if (plazo && !/^\d{2}-\d{2}$/.test(plazo)) return { error: 'El plazo va como mes-día, por ejemplo 03-27' };
  if (catalogo.some((d) => String(d.n) === n && String(d.n) !== String(orig))) return { error: `Ya existe la declaración N°${n} en el catálogo` };
  const previa = orig == null ? null : catalogo.find((d) => String(d.n) === String(orig));
  return { dj: {
    n, nm, desc: String(x.desc || '').trim(), plazo, plazoTxt: String(x.plazoTxt || '').trim(),
    regimenes: (x.regimenes || []).filter((r) => TODOS_REG.includes(r)), fuente: x.fuente && FUENTES[x.fuente] ? x.fuente : '',
    cert: String(x.cert || '').trim(), nota: String(x.nota || '').trim(), propia: !!(previa?.propia) || orig == null,
  } };
}

// ── Resúmenes: cifras de control para contrastar con el portal del SII ──
export interface Resumen { lineas: [string, string][]; ir?: string }
const clpTxt = (v: number) => clp(v);

export function resumenHonorarios(boletas: { bruto: number; rut: string | null }[], tasa: number): Resumen | null {
  if (!boletas.length) return null;
  const bruto = boletas.reduce((s, h) => s + (+h.bruto || 0), 0);
  const ret = Math.round(bruto * tasa);
  const personas = new Set(boletas.map((h) => String(h.rut || '').trim()).filter(Boolean)).size;
  return { lineas: [
    ['Boletas del ejercicio', boletas.length + ''], ['Personas distintas', personas + ''], ['Total bruto', clpTxt(bruto)],
    [`Retención (${(tasa * 100).toFixed(2).replace('.', ',')}%)`, clpTxt(ret)],
  ], ir: 'honorarios' };
}
export function resumenSueldos(libros: { lineas: unknown[]; totales: { totalHaberes?: number; iusc?: number } }[]): Resumen | null {
  let n = 0, rentas = 0, iusc = 0, meses = 0;
  for (const lb of libros) {
    if (!lb || !Array.isArray(lb.lineas) || !lb.lineas.length) continue;
    meses++; n = Math.max(n, lb.lineas.length);
    rentas += (lb.totales && lb.totales.totalHaberes) || 0;
    iusc += (lb.totales && lb.totales.iusc) || 0;
  }
  if (!meses) return null;
  return { lineas: [['Meses con remuneraciones', meses + ''], ['Trabajadores (máximo del año)', n + ''], ['Total haberes del año', clpTxt(rentas)], ['Impuesto Único retenido', clpTxt(iusc)]], ir: 'remuneraciones/libro' };
}
export function resumenRLI(R: { resultadoBalance: number; totalAgregados: number; totalDeducciones: number; rli: number; idpcNeto: number }): Resumen {
  return { lineas: [
    ['Resultado según balance', clpTxt(R.resultadoBalance)], ['Total agregados', clpTxt(R.totalAgregados)], ['Total deducciones', clpTxt(R.totalDeducciones)],
    [R.rli >= 0 ? 'Renta Líquida Imponible' : 'Pérdida tributaria', clpTxt(Math.abs(R.rli))], ['Impuesto de Primera Categoría', clpTxt(R.idpcNeto)],
  ], ir: 'renta' };
}
export function resumenPresunta(R: { presunta: { lbl: string; valor: number; pct: number; renta: number } | null; idpcNeto: number }): Resumen | null {
  if (!R.presunta) return null;
  return { lineas: [[R.presunta.lbl, clpTxt(R.presunta.valor)], ['Porcentaje de presunción', String(R.presunta.pct).replace('.', ',') + '%'], ['Renta presunta', clpTxt(R.presunta.renta)], ['Impuesto de Primera Categoría', clpTxt(R.idpcNeto)]], ir: 'renta' };
}
export function resumenBalance(filas: { cuenta: string; debe: number; haber: number }[]): Resumen | null {
  const imp = filas.filter((f) => f.cuenta.length === 7 && Math.abs(f.debe - f.haber) >= 0.5);
  if (!imp.length) return null;
  const debe = imp.reduce((s, f) => s + f.debe, 0), haber = imp.reduce((s, f) => s + f.haber, 0);
  return { lineas: [['Cuentas con movimiento', imp.length + ''], ['Sumas del Debe', clpTxt(debe)], ['Sumas del Haber', clpTxt(haber)], ['Diferencia', clpTxt(debe - haber)]], ir: 'balance' };
}

/** Filas del Excel de control (exportarDJExcel). */
export function filasExcelDJ(lista: DJ[], estados: Record<string, EstadoDJ>, at: number, empresa: { nombre: string; rut: string; anio: number; regimenLbl: string }, regimen: string) {
  const rows: (string | number)[][] = [
    ['CONTROL DE DECLARACIONES JURADAS DE RENTA'], [empresa.nombre, empresa.rut], ['Año Tributario', at, 'Ejercicio comercial', empresa.anio], ['Régimen', empresa.regimenLbl], [],
    ['N°', 'NOMBRE', 'APLICA', 'VENCE', 'ESTADO', 'FECHA PRESENTACIÓN', 'FOLIO', 'OBSERVACIONES'],
  ];
  for (const d of lista) {
    const st = estados[d.n] || estadoVacio();
    rows.push([d.n, d.nm, aplicaA(d, regimen) ? 'Sí' : 'No', plazoLbl(d, at), (ESTADOS_DJ[st.estado] || ESTADOS_DJ.pendiente).lbl, st.fecha || '', st.folio || '', st.obs || '']);
  }
  return rows;
}
