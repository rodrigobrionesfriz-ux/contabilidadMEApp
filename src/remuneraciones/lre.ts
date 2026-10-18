// Libro de Remuneraciones Electrónico (LRE) para Mi DT: traslado fiel de lre-dt.js.
// CSV separado por punto y coma, encabezados oficiales "Nombre(código)", fechas dd/mm/aaaa,
// montos enteros positivos y codificación ANSI (Windows-1252).

import type { LineaLibro } from './libro';
import type { Patronal } from './parametros';

export interface ConceptoLRE { codigo: string; nombre: string; obligatorio: boolean; header: string }
export const LRE_CONCEPTOS: ConceptoLRE[] = ([
  // Identificación trabajador
  ['1101','Rut trabajador',1],['1102','Fecha inicio contrato',1],['1103','Fecha término de contrato',0],['1104','Causal término de contrato',0],
  ['1105','Región prestación de servicios',1],['1106','Comuna prestación de servicios',1],['1170','Tipo impuesto a la renta',1],
  ['1146','Técnico extranjero exención cot. previsionales',1],['1107','Código tipo de jornada',1],['1108','Persona con discapacidad/pensionado por invalidez',1],
  ['1109','Pensionado por vejez',1],['1141','AFP',1],['1142','IPS (ExINP)',1],['1143','FONASA / ISAPRE',1],['1151','AFC',1],
  ['1110','CCAF',1],['1152','Org. administrador ley 16.744',1],['1111','Número cargas familiares legales autorizadas',0],
  ['1112','Número de cargas familiares maternales',0],['1113','Número de cargas familiares invalidez',0],['1114','Tramo asignación familiar',0],
  ['1171','Rut organización sindical 1',0],['1172','Rut organización sindical 2',0],['1173','Rut organización sindical 3',0],['1174','Rut organización sindical 4',0],
  ['1175','Rut organización sindical 5',0],['1176','Rut organización sindical 6',0],['1177','Rut organización sindical 7',0],['1178','Rut organización sindical 8',0],
  ['1179','Rut organización sindical 9',0],['1180','Rut organización sindical 10',0],['1115','Número días trabajados en el mes',1],
  ['1116','Número días de licencia médica en el mes',0],['1117','Número días de vacaciones en el mes',0],['1118','Subsidio trabajador joven',1],
  ['1154','Puesto trabajo pesado',0],['1155','Ahorro previsional voluntario individual',1],['1157','Ahorro previsional voluntario colectivo',1],
  ['1131','Indemnización a todo evento (Art. 164)',1],['1132','Tasa indemnización a todo evento (Art. 164)',0],
  // Haberes imponibles y tributables
  ['2101','Sueldo',1],['2102','Sobresueldo',0],['2103','Comisiones (mensual)',0],['2104','Semana corrida mensual (Art. 45)',0],
  ['2105','Participación (mensual)',0],['2106','Gratificación (mensual)',0],['2107','Recargo 30% día domingo (Art. 38)',0],
  ['2108','Remuneración variable pagada en vacaciones (Art. 71)',0],['2109','Remuneración variable pagada en clausura (Art. 38 DFL 2)',0],
  ['2110','Aguinaldo',0],['2111','Bonos u otras remuneraciones fijas mensuales',0],['2112','Tratos (mensual)',0],
  ['2113','Bonos u otras remuneraciones variables mensuales o superiores a un mes',0],['2114','Ejercicio opción no pactada en contrato (Art. 17 N°8 LIR)',0],
  ['2115','Beneficios en especie constitutivos de remuneración',0],['2116','Remuneraciones bimestrales (devengo en dos meses)',0],
  ['2117','Remuneraciones trimestrales (devengo en tres meses)',0],['2118','Remuneraciones cuatrimestral (devengo en cuatro meses)',0],
  ['2119','Remuneraciones semestrales (devengo en seis meses)',0],['2120','Remuneraciones anuales (devengo en doce meses)',0],
  ['2121','Participación anual (devengo en doce meses)',0],['2122','Gratificación anual (devengo en doce meses)',0],
  ['2123','Otras remuneraciones superiores a un mes',0],['2124','Pago por horas de trabajo sindical',0],['2161','Sueldo empresarial',0],
  // Haberes imponibles no tributables
  ['2201','Subsidio por incapacidad laboral por licencia médica - total mensual',0],['2202','Beca de estudio (Art. 17 N°18 LIR)',0],
  ['2203','Gratificaciones de zona (Art. 17 N°27)',0],['2204','Otros ingresos no constitutivos de renta (Art. 17 N°29 LIR)',0],
  // Haberes no imponibles no tributables
  ['2301','Colación total mensual (Art. 41)',0],['2302','Movilización total mensual (Art. 41)',0],['2303','Viáticos total mensual (Art. 41)',0],
  ['2304','Asignación de pérdida de caja total mensual (Art. 41)',0],['2305','Asignación de desgaste herramienta total mensual (Art. 41)',0],
  ['2311','Asignación familiar legal total mensual (Art. 41)',0],['2306','Gastos por causa del trabajo (Art. 41)',0],['2307','Gastos por cambio de residencia (Art. 53)',0],
  ['2308','Sala cuna (Art. 203)',0],['2309','Asignación trabajo a distancia o teletrabajo',0],['2347','Depósito convenido hasta UF 900',0],
  ['2310','Alojamiento por razones de trabajo (Art. 17 N°14 LIR)',0],['2312','Asignación de traslación (Art. 17 N°15 LIR)',0],
  ['2313','Indemnización por feriado legal',0],['2314','Indemnización años de servicio',0],['2315','Indemnización sustitutiva del aviso previo',0],
  ['2316','Indemnización fuero maternal (Art. 163 bis)',0],['2331','Indemnización a todo evento (Art. 164)',0],
  // Haberes no imponibles tributables
  ['2417','Indemnizaciones voluntarias tributables',0],['2418','Indemnizaciones contractuales tributables',0],
  // Descuentos
  ['3141','Cotización obligatoria previsional (AFP o IPS)',1],['3143','Cotización obligatoria salud 7%',1],['3144','Cotización voluntaria para salud',0],
  ['3151','Cotización AFC - trabajador',0],['3146','Cotizaciones técnico extranjero para seguridad social fuera de Chile',0],
  ['3147','Descuento depósito convenido hasta UF 900 anual',0],['3155','Cotización ahorro previsional voluntario individual modalidad A',0],
  ['3156','Cotización ahorro previsional voluntario individual modalidad B hasta UF 50',0],['3157','Cotización ahorro previsional voluntario colectivo modalidad A',0],
  ['3158','Cotización ahorro previsional voluntario colectivo modalidad B hasta UF 50',0],['3161','Impuesto retenido por remuneraciones',1],
  ['3162','Impuesto retenido por indemnizaciones',0],['3163','Mayor retención de impuestos solicitada por el trabajador',0],
  ['3164','Impuesto retenido por reliquidación remuneraciones devengadas en otros períodos',0],['3165','Diferencia de impuesto por reliquidación remuneraciones devengadas en este período',0],
  ['3166','Retención préstamo clase media 2020 (Ley 21.252)',0],['3167','Rebaja zona extrema DL 889',0],
  ['3171','Cuota sindical 1',0],['3172','Cuota sindical 2',0],['3173','Cuota sindical 3',0],['3174','Cuota sindical 4',0],['3175','Cuota sindical 5',0],
  ['3176','Cuota sindical 6',0],['3177','Cuota sindical 7',0],['3178','Cuota sindical 8',0],['3179','Cuota sindical 9',0],['3180','Cuota sindical 10',0],
  ['3110','Crédito social CCAF',0],['3181','Cuota vivienda o educación (Art. 58)',0],['3182','Crédito cooperativas de ahorro (Art 54. Ley Coop.)',0],
  ['3183','Otros descuentos autorizados y solicitados por el trabajador',0],['3154','Cotización adicional trabajo pesado - trabajador',0],
  ['3184','Donaciones culturales y de reconstrucción',0],['3185','Otros descuentos (Art. 58)',0],['3186','Pensiones de alimentos',0],
  ['3187','Descuento mujer casada (Art. 59)',0],['3188','Descuentos por anticipos y préstamos',0],
  // Aportes empleador
  ['4151','Aporte AFC - empleador',0],['4152','Aporte empleador seguro accidentes del trabajo y Ley SANNA (Ley 16.744)',1],
  ['4131','Aporte empleador indemnización a todo evento (Art. 164)',0],['4154','Aporte adicional trabajo pesado - empleador',0],
  ['4155','Aporte empleador seguro invalidez y sobrevivencia',1],['4157','Aporte empleador ahorro previsional voluntario colectivo',0],
  // Totales
  ['5201','Total haberes',1],['5210','Total haberes imponibles y tributables',1],['5220','Total haberes imponibles no tributables',1],
  ['5230','Total haberes no imponibles y no tributables',1],['5240','Total haberes no imponibles y tributables',1],
  ['5301','Total descuentos',1],['5361','Total descuentos impuestos a las remuneraciones',1],['5362','Total descuentos impuestos por indemnizaciones',0],
  ['5341','Total descuentos por cotizaciones del trabajador',1],['5302','Total otros descuentos',1],['5410','Total aportes empleador',1],
  ['5501','Total líquido',1],['5502','Total indemnizaciones',0],['5564','Total indemnizaciones tributables',1],['5565','Total indemnizaciones no tributables',0],
] as [string, string, number][]).map(([codigo, nombre, obligatorio]) => ({ codigo, nombre, obligatorio: !!obligatorio, header: `${nombre}(${codigo})` }));

export const AFP_DT: Record<string, string> = { provida: '6', planvital: '11', cuprum: '13', habitat: '14', uno: '19', capital: '31', modelo: '103' };
export const SALUD_DT: Record<string, string> = { cruzblanca: '1', banmedica: '3', colmena: '4', consalud: '9', vidatres: '12', nuevamasvida: '43', esencial: '44', fonasa: '102', fundacion: '40' };
const CCAF_DT: Record<string, string> = { ninguna: '0', losandes: '1', laaraucana: '2', losheroes: '3', '18septiembre': '4' };
const MUTUAL_DT: Record<string, string> = { achs: '1', mutual: '2', ist: '3', isl: '0' };

const nz = (v: unknown) => Math.max(0, Math.round(+(v as number) || 0));
const val = (v: unknown, def = '') => (v === undefined || v === null || v === '' ? def : String(v));
export function fechaDT(v: unknown) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}
export const rutDT = (v: unknown) => String(v || '').toUpperCase().replace(/\./g, '').replace(/\s+/g, '').replace(/^0+/, '');
function dvRut(cuerpo: string) {
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += +cuerpo[i] * mul; mul = mul === 7 ? 2 : mul + 1; }
  const r = 11 - (suma % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
function rutValido(r: unknown) { const s = rutDT(r), m = s.match(/^(\d{7,8})-([0-9K])$/); return !!(m && dvRut(m[1]) === m[2]); }

const RELLENABLES = ['region', 'comuna', 'fechaInicio'];
type Linea = Pick<LineaLibro, 'id' | 'rut' | 'nombre' | 'afpKey' | 'saludKey' | 'lre' | 'tramoAF'> & Partial<LineaLibro>;
type Registro = Record<string, string | number>;

/** Registro LRE de una línea del libro. `perfil`: datos LRE vigentes de la ficha (se combinan con los guardados en la línea). */
export function construirRegistroLRE(linea: Linea, patronal: Patronal, perfil: Record<string, unknown> = {}): Registro {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  // Lo guardado en la línea manda. Excepción: región, comuna y fecha de inicio vacías en la foto se completan desde la ficha
  // (son obligatorias y no cambian el cálculo). La fecha y causal de término nunca se toman de la ficha vigente.
  const p: Record<string, any> = { ...perfil, ...(linea.lre || {}) };
  for (const k of RELLENABLES) if ((p[k] === '' || p[k] == null) && perfil[k]) p[k] = perfil[k];
  for (const k of ['fechaTermino', 'causalTermino']) p[k] = (linea.lre as Record<string, unknown> | undefined)?.[k] ?? '';
  const l: Record<string, any> = linea;
  const r: Registro = {};
  r['1101'] = rutDT(l.rut); r['1102'] = fechaDT(p.fechaInicio); r['1103'] = fechaDT(p.fechaTermino); r['1104'] = val(p.causalTermino);
  r['1105'] = val(p.region); r['1106'] = val(p.comuna); r['1170'] = val(p.tipoImpuesto, '1'); r['1146'] = val(p.tecnicoExtranjero, '0');
  r['1107'] = val(p.jornada, '101'); r['1108'] = val(p.discapacidad, '0'); r['1109'] = val(p.pensionadoVejez, '0');
  r['1141'] = val(p.afpCodigo, AFP_DT[l.afpKey] || '');
  r['1142'] = val(p.ips, '0'); r['1143'] = val(p.saludCodigo, SALUD_DT[l.saludKey] || ''); r['1151'] = val(p.afc, '1');
  r['1110'] = p.ccafCodigo !== undefined && p.ccafCodigo !== '' ? String(p.ccafCodigo) : CCAF_DT[String(patronal.cajaInstitucion)] || '0';
  r['1152'] = p.mutualCodigo !== undefined && p.mutualCodigo !== '' ? String(p.mutualCodigo) : MUTUAL_DT[String(patronal.mutualInstitucion)] ?? '';
  r['1111'] = val(p.cargasLegales); r['1112'] = val(p.cargasMaternales); r['1113'] = val(p.cargasInvalidez); r['1114'] = val(l.tramoAF || p.tramoAsignacion);
  for (let i = 1; i <= 10; i++) r[String(1170 + i)] = val(p[`rutSindicato${i}`]);
  r['1115'] = val(p.diasTrabajados, '30'); r['1116'] = val(p.diasLicencia); r['1117'] = val(p.diasVacaciones); r['1118'] = val(p.subsidioJoven, '0');
  r['1154'] = val(p.trabajoPesado); r['1155'] = val(p.apvIndividual, '0'); r['1157'] = val(p.apvColectivo, '0'); r['1131'] = val(p.indemnizacionTodoEvento, '0'); r['1132'] = val(p.tasaIndemnizacion);

  r['2101'] = nz(l.base); r['2106'] = l.gratificacion ? nz(l.gratificacion) : '';
  const otrosCodigo = /^(2102|2103|2111|2113)$/.test(String(p.otrosCodigo || '')) ? String(p.otrosCodigo) : '2111';
  if (l.otros) r[otrosCodigo] = nz(l.otros);
  r['2301'] = l.colacion ? nz(l.colacion) : ''; r['2302'] = l.movilizacion ? nz(l.movilizacion) : '';
  r['2311'] = l.asigFamiliar ? nz(l.asigFamiliar) : '';

  r['3141'] = nz(l.descAFP); r['3143'] = nz(l.saludLegal); r['3144'] = l.adicionalIsapre ? nz(l.adicionalIsapre) : '';
  r['3151'] = l.descCesantia ? nz(l.descCesantia) : ''; r['3161'] = nz(l.iusc);
  r['3154'] = l.descTrabPesado ? nz(l.descTrabPesado) : ''; r['4154'] = l.trabPesado ? nz(l.trabPesado) : '';
  r['4151'] = l.afc ? nz(l.afc) : ''; r['4152'] = nz(l.mutual); r['4155'] = nz(l.sis);

  r['5201'] = nz(l.totalHaberes); r['5210'] = nz(l.totalImponible); r['5220'] = 0; r['5230'] = nz(l.totalNoImponible); r['5240'] = 0;
  r['5301'] = nz(l.totalDescuentos); r['5361'] = nz(l.iusc); r['5341'] = nz(l.totalPrevisional); r['5302'] = nz(l.anticipo || 0); r['3188'] = nz(l.anticipo || 0);
  r['5410'] = nz(l.totalPatronal); r['5501'] = nz(l.liquido); r['5564'] = 0;

  for (const c of LRE_CONCEPTOS) if (r[c.codigo] === undefined) r[c.codigo] = c.obligatorio ? 0 : '';
  return r;
}

export interface Observacion { trabajador: string; campo: string; msg: string }
export function validarLibroLRE(lineas: Linea[], patronal: Patronal, cerrado: boolean, perfiles: Record<string, Record<string, unknown>> = {}) {
  const errores: Observacion[] = [], advertencias: Observacion[] = [];
  if (!lineas.length) errores.push({ trabajador: '—', campo: 'Nómina', msg: 'No hay trabajadores en el período.' });
  lineas.forEach((linea, idx) => {
    const r = construirRegistroLRE(linea, patronal, perfiles[linea.id]), nom = linea.nombre || `Fila ${idx + 1}`;
    if (!rutValido(r['1101'])) errores.push({ trabajador: nom, campo: '1101', msg: 'RUT inválido o sin formato 12345678-9.' });
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(String(r['1102']))) errores.push({ trabajador: nom, campo: '1102', msg: 'Falta fecha de inicio de contrato (dd/mm/aaaa).' });
    if (!r['1105']) errores.push({ trabajador: nom, campo: '1105', msg: 'Falta código de región de prestación de servicios.' });
    if (!r['1106']) errores.push({ trabajador: nom, campo: '1106', msg: 'Falta código de comuna de prestación de servicios.' });
    if (!r['1141']) errores.push({ trabajador: nom, campo: '1141', msg: 'No se pudo determinar código DT de AFP.' });
    if (!r['1143']) errores.push({ trabajador: nom, campo: '1143', msg: 'No se pudo determinar código DT de FONASA/ISAPRE.' });
    if (!r['1152']) errores.push({ trabajador: nom, campo: '1152', msg: 'No se pudo determinar organismo administrador Ley 16.744.' });
    if (r['1103'] && !r['1104']) errores.push({ trabajador: nom, campo: '1104', msg: 'Si existe fecha de término, la causal es obligatoria.' });
    if (!r['1103'] && r['1104']) advertencias.push({ trabajador: nom, campo: '1104', msg: 'Hay causal de término sin fecha de término.' });
    const d = Number(String(r['1115']).replace(',', '.')); if (!(d >= 0 && d <= 31)) errores.push({ trabajador: nom, campo: '1115', msg: 'Días trabajados debe estar entre 0 y 31.' });
    if (!cerrado) advertencias.push({ trabajador: nom, campo: 'Período', msg: 'El libro está provisorio. Se recomienda cerrar el mes antes de generar el archivo LRE.' });
  });
  return { ok: errores.length === 0, errores, advertencias };
}

const csvEsc = (v: unknown) => { const s = String(v ?? ''); return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function textoLRE(lineas: Linea[], patronal: Patronal, perfiles: Record<string, Record<string, unknown>> = {}) {
  const headers = LRE_CONCEPTOS.map((c) => c.header);
  const filas = lineas.map((l) => { const r = construirRegistroLRE(l, patronal, perfiles[l.id]); return LRE_CONCEPTOS.map((c) => r[c.codigo]); });
  return [headers, ...filas].map((row) => row.map(csvEsc).join(';')).join('\r\n') + '\r\n';
}
export const nombreArchivoLRE = (rutEmpresa: string, anio: number, mes: number) => `${String(rutEmpresa || '').toUpperCase().replace(/[^0-9K]/g, '')}_${anio}${String(mes).padStart(2, '0')}.csv`;

/** Texto → bytes Windows-1252 (los caracteres fuera de la tabla pasan a "?"). */
export function aWindows1252(text: string) {
  const mapa: Record<string, number> = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A, '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C, 'ž': 0x9E, 'Ÿ': 0x9F };
  const out: number[] = [];
  for (const ch of text) { const cp = ch.codePointAt(0)!; out.push(cp <= 255 ? cp : (mapa[ch] ?? 0x3F)); }
  return new Uint8Array(out);
}
