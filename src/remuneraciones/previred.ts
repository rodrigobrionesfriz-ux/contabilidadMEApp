// Archivo de carga masiva Previred: traslado fiel de previred.js (formato estándar
// de largo variable por separador, versión 58).
//  - 105 campos por línea separados por ";". Numéricos enteros (no aplica → 0),
//    alfanuméricos vacíos, tasas 99,99, fechas dd/mm/aaaa, período mmaaaa.
//  - Una línea 00 por trabajador y una 01 por cada movimiento de personal adicional.
//  - .txt ANSI (Windows-1252), fin de línea CRLF, sin encabezado.

import { TIPOS_LICENCIA, type EventoAsistencia, type Trabajador } from './calculo';
import type { LineaLibro } from './libro';
import type { Patronal } from './parametros';
import type { Observacion } from './lre';

export const AFP_PREVIRED: Record<string, string> = { cuprum: '3', habitat: '5', provida: '8', planvital: '29', capital: '33', modelo: '34', uno: '35' };
export const SALUD_PREVIRED: Record<string, string> = { banmedica: '1', consalud: '2', vidatres: '3', colmena: '4', cruzblanca: '5', fonasa: '7', nuevamasvida: '10' };
const CCAF_PREVIRED: Record<string, string> = { ninguna: '0', losandes: '1', laaraucana: '2', losheroes: '3', '18septiembre': '6' };
const MUTUAL_PREVIRED: Record<string, string> = { achs: '1', mutual: '2', ist: '3', isl: '0' };
const PAGADOR_SUBSIDIO: Record<string, string> = {
  banmedica: '96572800-7', consalud: '96856780-2', vidatres: '96502530-8', colmena: '76296619-0',
  cruzblanca: '96501450-0', fonasa: '61603000-0', nuevamasvida: '96504160-5',
  achs: '70360100-6', mutual: '70285100-9', ist: '70015580-3', isl: '61533000-0',
};
const N_CAMPOS = 105;

export interface CfgPrevired { sucursalMutual?: string; codigos?: Record<string, string> }

const num = (v: unknown) => String(Math.max(0, Math.round(+(v as number) || 0)));
const fecha = (iso: string | undefined) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const ufTxt = (v: number) => { const s = (+v || 0).toFixed(4).replace(/0+$/, '').replace(/\.$/, ''); return s.replace('.', ','); };
export function textoPrevired(v: unknown, max = 30) {
  return String(v || '').normalize('NFD').replace(/[̀-̂̄-ͯ]/g, '') // quita tildes, conserva la virgulilla de la Ñ
    .normalize('NFC').toUpperCase().replace(/[^A-ZÑ ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function separarRut(r: unknown) {
  const s = String(r || '').toUpperCase().replace(/[^0-9K]/g, '');
  return s.length < 2 ? { cuerpo: '', dv: '' } : { cuerpo: String(+s.slice(0, -1)), dv: s.slice(-1) };
}
function dvRut(cuerpo: string) {
  let suma = 0, mul = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += +cuerpo[i] * mul; mul = mul === 7 ? 2 : mul + 1; }
  const r = 11 - (suma % 11); return r === 11 ? '0' : r === 10 ? 'K' : String(r);
}
/** Nombre: campos de la ficha; si faltan, divide el nombre completo (últimas dos palabras = apellidos). */
export function nombresTrabajador(t: Pick<Trabajador, 'nombre' | 'nombres' | 'apellidoPaterno' | 'apellidoMaterno'>) {
  if (t.apellidoPaterno && t.nombres) return { pat: t.apellidoPaterno, mat: t.apellidoMaterno || '', nom: t.nombres, auto: false };
  const p = String(t.nombre || '').trim().split(/\s+/);
  if (p.length >= 3) return { pat: p[p.length - 2], mat: p[p.length - 1], nom: p.slice(0, -2).join(' '), auto: true };
  if (p.length === 2) return { pat: p[1], mat: '', nom: p[0], auto: true };
  return { pat: '', mat: '', nom: p[0] || '', auto: true };
}

export interface Movimiento { codigo: number; desde: string; hasta: string; nm: string; pagador?: string; pagadorKey?: string }
/** Movimientos de personal del mes (Tabla 7). */
export function movimientosDelMes(t: Trabajador, anio: number, mes: number, eventos: EventoAsistencia[], mutualInstitucion: string): Movimiento[] {
  const dm = new Date(anio, mes, 0).getDate();
  const ini = `${anio}-${String(mes).padStart(2, '0')}-01`, fin = `${anio}-${String(mes).padStart(2, '0')}-${String(dm).padStart(2, '0')}`;
  const recorta = (d: string, h: string) => ({ desde: d < ini ? ini : d, hasta: h > fin ? fin : h });
  const movs: Movimiento[] = [];
  const lre = t.lre || {};
  if (lre.fechaInicio && lre.fechaInicio >= ini && lre.fechaInicio <= fin)
    movs.push({ codigo: t.contrato === 'plazo' ? 7 : 1, desde: lre.fechaInicio, hasta: '', nm: t.contrato === 'plazo' ? 'Contratación plazo fijo' : 'Contratación indefinida' });
  eventos.filter((e) => e.trab === t.id && e.desde <= fin && (e.hasta || e.desde) >= ini).sort((a, b) => a.desde.localeCompare(b.desde)).forEach((e) => {
    const r = recorta(e.desde, e.hasta || e.desde);
    if (e.tipo === 'licencia') {
      const accidente = e.licTipo === '5' || e.licTipo === '6';
      const pagadorKey = accidente ? mutualInstitucion : (t.salud || 'fonasa');
      const lic = TIPOS_LICENCIA.find((x) => x.k === String(e.licTipo));
      movs.push({ codigo: accidente ? 6 : 3, ...r, pagador: PAGADOR_SUBSIDIO[pagadorKey] || '', pagadorKey, nm: lic ? lic.nm : 'Licencia médica' });
    } else if (e.tipo === 'permiso_sin') movs.push({ codigo: 4, ...r, nm: 'Permiso sin goce de sueldo' });
    else if (e.tipo === 'ausencia') movs.push({ codigo: 11, ...r, nm: 'Ausencia injustificada' });
  });
  if (lre.fechaTermino && lre.fechaTermino >= ini && lre.fechaTermino <= fin)
    movs.push({ codigo: 2, desde: '', hasta: lre.fechaTermino, nm: 'Retiro' });
  return movs;
}

const ALFA = new Set([2, 3, 4, 5, 6, 14, 16, 17, 18, 25, 35, 36, 37, 41, 46, 51, 52, 53, 54, 56, 57, 76, 104, 105]);
const TASAS = new Set([32, 38, 63, 68]);
const lineaVacia = (): (string | undefined)[] => new Array(N_CAMPOS + 1).fill(undefined);
function cerrarLinea(c: (string | undefined)[]) {
  const out: string[] = [];
  for (let i = 1; i <= N_CAMPOS; i++) {
    let v = c[i];
    if (v === undefined || v === null) v = ALFA.has(i) ? '' : TASAS.has(i) ? '00,00' : '0';
    out.push(String(v).replace(/;/g, ' '));
  }
  return out;
}

export interface EntradaPrevired {
  anio: number; mes: number; lineas: LineaLibro[]; cerrado: boolean; uf: number;
  trabajadores: Trabajador[]; eventos: EventoAsistencia[]; patronal: Patronal; topeAFP_UF: number;
  rutEmpresa: string; cfg?: CfgPrevired;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function construirPrevired(E: EntradaPrevired) {
  const { anio, mes, cerrado } = E;
  const P = E.patronal;
  const cfg = { sucursalMutual: E.cfg?.sucursalMutual || '', codigos: E.cfg?.codigos || {} };
  const codigo = (tabla: string, mapa: Record<string, string>, key: string | undefined) => {
    const manual = cfg.codigos[`${tabla}:${key}`];
    if (manual !== undefined && manual !== '') return String(+manual);
    return mapa[key as string] !== undefined ? mapa[key as string] : null;
  };
  const per = `${String(mes).padStart(2, '0')}${anio}`;
  const errores: Observacion[] = [], advertencias: Observacion[] = [];
  const lineas: { trabajador: string; campos: string[]; tipo: '00' | '01'; movimiento: Movimiento | null }[] = [];
  const err = (tr: string, campo: string, msg: string) => errores.push({ trabajador: tr, campo, msg });
  const adv = (tr: string, campo: string, msg: string) => advertencias.push({ trabajador: tr, campo, msg });

  const rEmp = separarRut(E.rutEmpresa);
  if (!rEmp.cuerpo) err('Empresa', 'RUT', 'La empresa no tiene RUT: se necesita para el nombre del archivo.');
  const cajaKey = String(P.cajaInstitucion || 'ninguna'), conCaja = cajaKey !== 'ninguna';
  const codCaja = codigo('ccaf', CCAF_PREVIRED, cajaKey);
  if (codCaja === null) err('Empresa', 'Campo 83', `La caja "${cajaKey}" no tiene código Previred. Ingrésalo en la configuración Previred.`);
  const mutualKey = String(P.mutualInstitucion || 'isl');
  const codMutual = codigo('mutual', MUTUAL_PREVIRED, mutualKey);
  if (codMutual === null) err('Empresa', 'Campo 96', `La mutual "${mutualKey}" no tiene código Previred.`);
  if (cerrado && E.lineas.some((l) => l.baseAFP === undefined)) adv('Empresa', 'Libro', 'El libro de este mes se cerró con una versión anterior: las bases se reconstruyen desde los montos. Si puedes, reábrelo y ciérralo de nuevo.');
  if (!cerrado) adv('Empresa', 'Libro', `El libro de ${['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][mes - 1]} está provisorio. Ciérralo antes de declarar para que el archivo coincida con lo pagado.`);

  const identificacion = (c: (string | undefined)[], t: Trabajador) => {
    const r = separarRut(t.rut), n = nombresTrabajador(t);
    c[1] = r.cuerpo; c[2] = r.dv;
    c[3] = textoPrevired(n.pat); c[4] = textoPrevired(n.mat); c[5] = textoPrevired(n.nom);
    c[6] = t.sexo === 'F' ? 'F' : t.sexo === 'M' ? 'M' : '';
    c[7] = t.nacionalidad === '1' ? '1' : '0';
    c[8] = '1'; c[9] = per; c[11] = 'AFP';
    c[12] = String(t.tipoTrabajador || '0');
  };
  const lineaMovimiento = (c: (string | undefined)[], mv: Movimiento) => {
    c[15] = String(mv.codigo); c[16] = fecha(mv.desde); c[17] = fecha(mv.hasta);
    if (mv.pagador) { const r = separarRut(mv.pagador); c[103] = r.cuerpo; c[104] = r.dv; }
  };

  for (const l0 of E.lineas) {
    const l: Record<string, any> = l0;
    const t: Trabajador = { ...(E.trabajadores.find((x) => x.id === l.id) || {} as Trabajador), rut: l.rut, nombre: l.nombre, afp: l.afpKey, salud: l.saludKey, contrato: l.contrato, lre: l.lre };
    const quien = l.nombre || l.rut || '—';
    const c = lineaVacia();
    identificacion(c, t);
    const r = separarRut(t.rut);
    if (!r.cuerpo) err(quien, 'Campo 1', 'Falta el RUT del trabajador.');
    else if (dvRut(r.cuerpo) !== r.dv) err(quien, 'Campo 2', `RUT ${t.rut} con dígito verificador inválido.`);
    const n = nombresTrabajador(t);
    if (textoPrevired(n.pat).length < 2) err(quien, 'Campo 3', 'Falta el apellido paterno (mínimo 2 letras). Complétalo en la ficha.');
    if (textoPrevired(n.nom).length < 2) err(quien, 'Campo 5', 'Faltan los nombres (mínimo 2 letras). Complétalo en la ficha.');
    if (n.auto) adv(quien, 'Campos 3-5', `Apellidos y nombres separados automáticamente (${textoPrevired(n.pat)} / ${textoPrevired(n.mat)} / ${textoPrevired(n.nom)}). Revísalos en la ficha.`);
    if (!c[6]) err(quien, 'Campo 6', 'Falta el sexo (M/F). Complétalo en la ficha.');
    if (+c[12]! === 1 || +c[12]! === 2) adv(quien, 'Campo 12', 'Trabajador pensionado: la liquidación no aplica reglas especiales de pensionados. Revisa las cotizaciones.');

    const dias = Math.max(0, Math.min(30, +l.diasPagados || 0));
    c[13] = String(dias);
    c[14] = '00';
    const movs = movimientosDelMes(t, anio, mes, E.eventos, mutualKey);
    if (movs.length) lineaMovimiento(c, movs[0]); else c[15] = '0';
    if (dias === 0 && !movs.some((m) => [3, 6, 4, 11, 2, 1, 7].includes(m.codigo)))
      err(quien, 'Campo 13', '0 días trabajados sin movimiento de personal: registra la ausencia en Asistencia.');
    if (l.tramoAF !== undefined) {
      const cg = l.cargasAF || {};
      c[18] = /^[ABCD]$/.test(l.tramoAF) ? l.tramoAF : 'D';
      if (cg.simples) c[19] = num(cg.simples);
      if (cg.maternales) c[20] = num(cg.maternales);
      if (cg.invalidas) c[21] = num(cg.invalidas);
      if (+l.asigFamiliar > 0) c[22] = num(l.asigFamiliar);
      if ((cg.simples || 0) > 13 || (cg.maternales || 0) > 1 || (cg.invalidas || 0) > 1) err(quien, 'Campos 19-21', 'Previred acepta hasta 13 cargas simples, 1 maternal y 1 inválida.');
      if (c[18] === 'D' && (cg.simples || cg.maternales || cg.invalidas)) adv(quien, 'Campo 18', 'Tiene cargas familiares, pero su tramo es D (sin derecho a asignación).');
    } else {
      c[18] = 'D';
      if (+(l.lre?.cargasLegales || 0) > 0) adv(quien, 'Campos 18-22', 'Libro cerrado antes de calcular asignación familiar: se informa tramo D. Reabre y cierra el libro para incluirla.');
    }
    if (+l.descTrabPesado > 0 || +l.trabPesado > 0) {
      const pct = +l.tasaTrabPesado || 0;
      c[37] = textoPrevired(l.puestoPesado || '', 40);
      c[38] = (pct < 10 ? '0' : '') + pct.toFixed(2).replace('.', ',');
      c[39] = num((+l.descTrabPesado || 0) + (+l.trabPesado || 0));
      if (!c[37]) err(quien, 'Campo 37', 'Falta el nombre del puesto de trabajo pesado en la ficha.');
      if (c[38] !== '04,00' && c[38] !== '02,00') err(quien, 'Campo 38', `Previred solo acepta 04,00 o 02,00 como % de trabajo pesado (calculado ${c[38]}).`);
    }

    const topeAFP = Math.round((+E.topeAFP_UF || 0) * (+E.uf || 0));
    const baseAFP = l.baseAFP !== undefined ? l.baseAFP : Math.min(+l.totalImponible || 0, Math.round(topeAFP * dias / 30));
    const baseAFC = l.baseAFC !== undefined ? l.baseAFC : (l.baseCes !== undefined ? l.baseCes : baseAFP);

    const codAFP = codigo('afp', AFP_PREVIRED, t.afp);
    if (codAFP === null) err(quien, 'Campo 26', `AFP "${t.afp || '—'}" sin código Previred.`);
    c[26] = codAFP ?? '0';
    c[27] = num(baseAFP);
    c[28] = num((+l.descAFP || 0) + (+l.capInd || 0));
    c[29] = num(l.sis);
    c[92] = num(l.rentaLicencia);
    c[93] = l.jornada === '2' ? '2' : '1';
    c[94] = num(l.cev);
    c[95] = num(l.crp);
    if (l.cev === undefined && cerrado) adv(quien, 'Campos 94-95', 'Libro cerrado antes de incorporar la reforma de pensiones: CEV y rentabilidad protegida van en 0. Reabre y cierra el libro para incluirlas.');

    const salud = t.salud || 'fonasa';
    const codSalud = codigo('salud', SALUD_PREVIRED, salud);
    if (codSalud === null) err(quien, 'Campo 75', `La institución de salud "${salud}" no tiene código en la tabla Previred v58. Ingrésalo en la configuración Previred.`);
    c[75] = codSalud ?? '0';
    if (salud === 'fonasa') {
      if (conCaja) {
        const tCaja = isFinite(+P.ccafSaludCaja) && P.ccafSaludCaja !== '' && P.ccafSaludCaja !== undefined ? +P.ccafSaludCaja : 4.2;
        const tFon = isFinite(+P.ccafSaludFonasa) && P.ccafSaludFonasa !== '' && P.ccafSaludFonasa !== undefined ? +P.ccafSaludFonasa : 2.8;
        if (Math.abs(tCaja + tFon - 7) > 0.001) adv(quien, 'Campos 70 y 90', `La distribución del 7% con caja suma ${(tCaja + tFon).toLocaleString('es-CL')}%: revisa las tasas en Previsional.`);
        c[70] = num(baseAFP * tFon / 100);
        c[90] = num(baseAFP * tCaja / 100);
      } else c[70] = num(l.saludLegal);
      c[78] = '1';
    } else {
      c[76] = String(t.numeroFUN || '').replace(/[^0-9A-Za-z]/g, '').slice(0, 16);
      c[77] = num(baseAFP);
      const plan = +l.planUF || +(t.plan || 0) || 0;
      if (plan > 0) { c[78] = '2'; c[79] = ufTxt(plan); } else { c[78] = '1'; c[79] = num(l.saludLegal); }
      c[80] = num(l.saludLegal);
      c[81] = num(l.adicionalIsapre);
      if (!c[76]) adv(quien, 'Campo 76', 'Falta el N° de FUN del contrato de Isapre (recomendado).');
    }
    if (codMutual === '0') c[71] = num(l.mutual);
    else { c[96] = codMutual ?? '0'; c[97] = num(baseAFP); c[98] = num(l.mutual); c[99] = num(cfg.sucursalMutual || 0); }
    if (conCaja && codCaja) { c[83] = codCaja; c[84] = num(baseAFP); }
    c[100] = num(baseAFC);
    c[101] = num(l.descCesantia);
    c[102] = num(l.afc);
    if (+l.descCesantia > 0 && !(baseAFC > 0)) err(quien, 'Campo 100', 'Cotización de cesantía sin renta imponible.');

    lineas.push({ trabajador: quien, campos: cerrarLinea(c), tipo: '00', movimiento: movs[0] || null });
    for (const mv of movs.slice(1)) {
      const d = lineaVacia();
      identificacion(d, t);
      d[13] = '0'; d[14] = '01'; d[18] = '';
      d[26] = codAFP ?? '0';
      lineaMovimiento(d, mv);
      lineas.push({ trabajador: quien, campos: cerrarLinea(d), tipo: '01', movimiento: mv });
    }
    movs.forEach((mv) => {
      if ((mv.codigo === 3 || mv.codigo === 6) && !mv.pagador) err(quien, 'Campo 103', `Licencia sin entidad pagadora de subsidio conocida (${mv.pagadorKey || '—'}).`);
    });
  }
  if (!E.lineas.length) err('—', 'Nómina', 'No hay trabajadores en el período.');
  return { lineas, errores, advertencias, ok: !errores.length, nombre: `${rEmp.cuerpo || 'empresa'}_previred_${anio}${String(mes).padStart(2, '0')}.txt` };
}
export type ResultadoPrevired = ReturnType<typeof construirPrevired>;
export const textoArchivoPrevired = (res: ResultadoPrevired) => res.lineas.map((x) => x.campos.join(';')).join('\r\n') + '\r\n';
