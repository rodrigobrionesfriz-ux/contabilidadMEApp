// Registro masivo de contratos de trabajo en Mi DT: traslado fiel de contratos-dt.js
// (Instructivo DT v21.04.22). CSV con ";", una fila por trabajador, fechas DD/MM/AAAA,
// RUT sin puntos con guion, montos sin puntos, horas HH:MM. Un archivo por cargo.

import type { Trabajador } from './calculo';
import { DT_COMUNAS } from './contratos-dt-tablas';

export const COLUMNAS = ['CATEGORIA_CONTRATO', 'COMUNA_CELEBRACION', 'FECHA_SUSCRPCION', 'RUT_TRABAJADOR', 'DNI_TRABAJADOR',
  'FECHA_NACIMIENTO', 'NOMBRES', 'APELLIDOS', 'SEXO', 'NACIONALIDAD', 'EMAIL', 'TELEFONO', 'COMUNA', 'CALLE',
  'NUMERO', 'DPTO', 'DECLARACION_DISCAPACIDAD', 'DECLARACION_INVALIDEZ', 'FUNCIONES', 'SUBCONTRATACION',
  'RUT_EMPRESA_PRINCIPAL', 'EST', 'RUT_EMPRESA_USUARIA', 'FAENA_COMUNA', 'FAENA_CALLE', 'FAENA_NUMERO',
  'FAENA_DPTO', 'ZONA_GEOGRAFICA_1', 'ZONA_GEOGRAFICA_2', 'ZONA_GEOGRAFICA_3', 'ZONA_GEOGRAFICA_4',
  'ZONA_GEOGRAFICA_5', 'SUELDO_BASE', 'MONTO_IMPONIBLE', 'HABER_1', 'MONTO_1', 'PER_DEVENGAMIENTO_1',
  'HABER_2', 'MONTO_2', 'PER_DEVENGAMIENTO_2', 'HABER_3', 'MONTO_3', 'PER_DEVENGAMIENTO_3', 'HABER_4',
  'MONTO_4', 'PER_DEVENGAMIENTO_4', 'HABER_5', 'MONTO_5', 'PER_DEVENGAMIENTO_5', 'GRAT_FORMA_PAGO',
  'GRAT_MODALIDAD', 'GRAT_PERIODO_PAGO', 'REM_PERIODO_PAGO', 'REM_FECHA_PAGO', 'REM_FORMA_PAGO',
  'REM_ANTICIPO', 'REM_AFP', 'REM_SALUD', 'REM_OTROS_PACTOS', 'TIPO_JORNADA', 'NRO_RESOLUCION',
  'FECHA_RESOLUCION', 'DURACION_JORNADA', 'TURNOS', 'TIEMPO_COLACION', 'T_COLACION_IMP',
  'T_COLACION_NO_IMP', 'ROTACION', 'NRO_DIAS_DIST_JOR', 'LUNES_HORA_INICIO', 'LUNES_HORA_TERMINO',
  'MARTES_HORA_INICIO', 'MARTES_HORA_TERMINO', 'MIERCOLES_HORA_INICIO', 'MIERCOLES_HORA_TERMINO',
  'JUEVES_HORA_INICIO', 'JUEVES_HORA_TERMINO', 'VIERNES_HORA_INICIO', 'VIERNES_HORA_TERMINO',
  'SABADO_HORA_INICIO', 'SABADO_HORA_TERMINO', 'DOMINGO_HORA_INICIO', 'DOMINGO_HORA_TERMINO',
  'TIPO_CONTRATO', 'FECHA_INI_RELABORAL', 'FECHA_FIN_RELABORAL', 'OTROS_INDEMNIZACIONES',
  'OTROS_FERIADOS', 'OTROS_NEGOCIACIONES', 'OTROS_PROPINTELECTUAL', 'OTROS_LICMEDICA',
  'OTROS_SALACUNA', 'OTROS_PERMISOS', 'OTROS_CONESPECIALES', 'OTROS_SEGUROS', 'OTROS_STOCK',
  'OTROS_INSTCOLECTIVO', 'AFECTO_A', 'FECHA_INI_INSTCOLECTIVO', 'FECHA_FIN_INSTCOLECTIVO'];

export const AFP_DT_CONTRATO: Record<string, number> = { provida: 6, planvital: 11, cuprum: 13, habitat: 14, uno: 19, capital: 31, modelo: 103 };
export const SALUD_DT_CONTRATO: Record<string, number> = { cruzblanca: 1, banmedica: 3, colmena: 4, consalud: 9, vidatres: 12, fundacion: 40, nuevamasvida: 43, fonasa: 102 };
export const DIAS: [string, string, string][] = [['lu', 'LUNES', 'Lunes'], ['ma', 'MARTES', 'Martes'], ['mi', 'MIERCOLES', 'Miércoles'], ['ju', 'JUEVES', 'Jueves'], ['vi', 'VIERNES', 'Viernes'], ['sa', 'SABADO', 'Sábado'], ['do', 'DOMINGO', 'Domingo']];
export const TIPOS_JORNADA: [number, string][] = [[1, 'Semanal ordinaria'], [2, 'Semanal extendida'], [3, 'Bisemanal'], [4, 'Mensual'], [5, 'Diaria'], [6, 'Excepcional (con resolución)'], [7, 'Art. 22 (sin límite de jornada)'], [8, 'Art. 38 semanal ordinaria'], [9, 'Art. 38 semanal extendida']];
export const FORMAS_PAGO: [number, string][] = [[1, 'Efectivo'], [2, 'Cheque'], [3, 'Vale vista'], [4, 'Depósito bancario'], [5, 'Transferencia bancaria']];
export const ANTICIPOS: [number, string][] = [[1, 'Sin anticipo'], [2, 'Por hora'], [3, 'Diario'], [4, 'Semanal'], [5, 'Quincenal']];
export const GRAT_FORMAS: [number, string][] = [[1, 'No pactado'], [2, 'Art. 47 (30% utilidades)'], [3, 'Convencional superior al mínimo legal'], [4, 'Art. 50 (25% con tope 4,75 IMM)'], [5, 'Sin obligación legal de pago']];
export const TIPOS_CONTRATO: [number, string][] = [[1, 'Indefinido'], [2, 'Plazo fijo'], [3, 'Obra o faena']];
export const TURNOS_DT: [number, string][] = [[1, 'Horario fijo'], [2, 'Turno mañana'], [3, 'Turno tarde'], [4, 'Turno noche']];

export type Horario = Record<string, [string, string] | string[]>;
/** Valores por defecto de la empresa para los contratos. */
export interface DefaultsContrato {
  comunaCelebracion?: string; zona1?: string; tipoJornada?: number; duracion?: number; turnos?: number; colacion?: number | string;
  colacionImputable?: boolean; horario?: Horario; diaPago?: number; formaPago?: number; anticipo?: number;
}
/** Datos propios del contrato de un trabajador (ficha.contratoDT). */
export interface FichaContratoDT {
  fechaSuscripcion?: string; tipoContrato?: number; fechaFin?: string; fechaNacimiento?: string; nacionalidad?: string; dni?: string;
  email?: string; telefono?: string; domComuna?: string; domCalle?: string; domNumero?: string; domDpto?: string; funciones?: string;
  comunaCelebracion?: string; zona1?: string; tipoJornada?: number; nroResolucion?: string; fechaResolucion?: string; duracion?: number | string;
  turnos?: number; colacion?: number | string; colacionImputable?: boolean; horario?: Horario; horarioPropio?: boolean; diaPago?: number | string;
  formaPago?: number | string; anticipo?: number | string; gratForma?: number | string; gratModalidad?: string; subcontratacion?: number;
  rutPrincipal?: string; otrosPactos?: string; informado?: string;
}
export interface EmpresaContrato { comuna?: string; ciudad?: string; rut?: string }

export const normDT = (s: unknown) => String(s || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const fDT = (iso: unknown) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
export const rutContratoDT = (r: unknown) => { const s = String(r || '').toUpperCase().replace(/[^0-9K]/g, '').replace(/^0+/, ''); return s.length > 1 ? `${s.slice(0, -1)}-${s.slice(-1)}` : ''; };
const entero = (v: unknown) => String(Math.max(0, Math.round(+(v as number) || 0)));
const hhmm = (v: unknown) => (/^\d{1,2}:\d{2}$/.test(String(v || '')) ? String(v).padStart(5, '0') : '');
const minutos = (v: unknown) => { const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : null; };
export const comunaPorNombre = (nm: unknown) => { const k = normDT(nm); if (!k) return ''; const c = DT_COMUNAS.find((x) => normDT(x.nm) === k); return c ? String(c.cd) : ''; };
export const nombreComuna = (cd: unknown) => DT_COMUNAS.find((x) => x.cd === +(cd as number))?.nm || '';
const esFecha = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export function defaultsEmpresa(E: EmpresaContrato, d: DefaultsContrato = {}) {
  const comunaEmp = comunaPorNombre(E.comuna) || comunaPorNombre(E.ciudad);
  return {
    comunaCelebracion: d.comunaCelebracion || comunaEmp || '',
    zona1: d.zona1 || comunaEmp || '',
    tipoJornada: +(d.tipoJornada as number) || 1,
    duracion: +(d.duracion as number) || 42,
    turnos: +(d.turnos as number) || 1,
    colacion: d.colacion != null && d.colacion !== '' ? +d.colacion : 60,
    colacionImputable: !!d.colacionImputable,
    horario: d.horario || { lu: ['08:00', '17:30'], ma: ['08:00', '17:30'], mi: ['08:00', '17:30'], ju: ['08:00', '17:30'], vi: ['08:00', '16:30'], sa: ['', ''], do: ['', ''] } as Horario,
    diaPago: +(d.diaPago as number) || 30,
    formaPago: +(d.formaPago as number) || 5,
    anticipo: +(d.anticipo as number) || 1,
  };
}
export type Defaults = ReturnType<typeof defaultsEmpresa>;

/** Datos del contrato de un trabajador completados con los valores por defecto de la empresa. */
export function datosContrato(t: Trabajador, D: Defaults) {
  const c: FichaContratoDT = t.contratoDT || {}; const lre = t.lre || {};
  const tipoContrato = +(c.tipoContrato as number) || (t.contrato === 'plazo' ? 2 : 1);
  let gratForma = +(c.gratForma as number);
  if (!gratForma) gratForma = (t.gratifModo || 'pct') === 'pct' ? 4 : ((+(t.grat || 0) || 0) > 0 ? 3 : 1);
  return {
    fechaSuscripcion: c.fechaSuscripcion || lre.fechaInicio || '',
    fechaInicio: lre.fechaInicio || '',
    fechaFin: c.fechaFin || lre.fechaTermino || '',
    tipoContrato,
    fechaNacimiento: c.fechaNacimiento || '',
    nacionalidad: c.nacionalidad || (String(t.nacionalidad || '0') === '0' ? '320' : ''),
    dni: c.dni || '',
    email: c.email || '', telefono: c.telefono || '',
    domComuna: c.domComuna || '', domCalle: c.domCalle || '', domNumero: c.domNumero || '', domDpto: c.domDpto || '',
    funciones: c.funciones || t.cargo || '',
    comunaCelebracion: c.comunaCelebracion || D.comunaCelebracion,
    zona1: c.zona1 || D.zona1,
    tipoJornada: +(c.tipoJornada as number) || D.tipoJornada,
    nroResolucion: c.nroResolucion || '', fechaResolucion: c.fechaResolucion || '',
    duracion: c.duracion != null && c.duracion !== '' ? +c.duracion : D.duracion,
    turnos: +(c.turnos as number) || D.turnos,
    colacion: c.colacion != null && c.colacion !== '' ? +c.colacion : D.colacion,
    colacionImputable: c.colacionImputable != null ? !!c.colacionImputable : D.colacionImputable,
    horario: (c.horarioPropio && c.horario ? c.horario : D.horario) as Horario,
    horarioPropio: !!c.horarioPropio,
    diaPago: +(c.diaPago as number) || D.diaPago,
    formaPago: +(c.formaPago as number) || D.formaPago,
    anticipo: +(c.anticipo as number) || D.anticipo,
    gratForma, gratModalidad: c.gratModalidad || ((gratForma === 3 && (+(t.grat || 0) || 0) > 0) ? `Gratificación mensual fija de $${Math.round(+(t.grat || 0)).toLocaleString('es-CL')}` : ''),
    subcontratacion: +(c.subcontratacion as number) || 0, rutPrincipal: c.rutPrincipal || '',
    otrosPactos: c.otrosPactos || '',
    informado: c.informado || '',
  };
}
export type DatosContrato = ReturnType<typeof datosContrato>;

/** Horas semanales del horario (descontando la colación no imputable). */
export function horasSemana(dc: Pick<DatosContrato, 'horario' | 'colacion' | 'colacionImputable'>) {
  let min = 0, dias = 0;
  DIAS.forEach(([k]) => { const h = dc.horario[k] || ['', '']; const a = minutos(h[0]), b = minutos(h[1]); if (a != null && b != null && b > a) { min += b - a; dias++; } });
  if (!dc.colacionImputable) min -= dias * (+dc.colacion || 0);
  return { horas: Math.round(min / 60 * 100) / 100, dias };
}

export function validarContrato(t: Trabajador, D: Defaults) {
  const dc = datosContrato(t, D), err: string[] = [], avi: string[] = [];
  const req = (cond: unknown, msg: string) => { if (!cond) err.push(msg); };
  req(rutContratoDT(t.rut) || dc.dni, 'RUT del trabajador');
  req(esFecha(dc.fechaSuscripcion), 'fecha de suscripción del contrato');
  req(esFecha(dc.fechaInicio), 'fecha de inicio de la relación laboral (ficha → LRE)');
  req(esFecha(dc.fechaNacimiento), 'fecha de nacimiento');
  req(t.nombres || t.nombre, 'nombres');
  req(t.apellidoPaterno, 'apellidos (ficha)');
  req(t.sexo === 'M' || t.sexo === 'F', 'sexo (ficha)');
  req(+dc.nacionalidad > 0, 'nacionalidad');
  req(+dc.comunaCelebracion > 0, 'comuna de celebración');
  req(+dc.domComuna > 0 && String(dc.domCalle).trim(), 'domicilio del trabajador (comuna y calle)');
  req(String(dc.funciones).trim(), 'funciones');
  if (String(dc.funciones).length > 300) err.push('funciones: máximo 300 caracteres');
  req(+dc.zona1 > 0, 'comuna donde se prestan los servicios');
  req(AFP_DT_CONTRATO[t.afp as string] != null, `AFP con código DT${t.afp ? ` (${t.afp})` : ''}`);
  req(SALUD_DT_CONTRATO[t.salud as string] != null, `institución de salud con código DT${t.salud && SALUD_DT_CONTRATO[t.salud] == null ? ` (${t.salud} no figura en la tabla DT)` : ''}`);
  if (t.tipoPago !== 'hora') req((+(t.base || 0) || 0) > 0, 'sueldo base');
  if (dc.tipoContrato === 2) req(esFecha(dc.fechaFin), 'fecha de término (contrato a plazo fijo)');
  if (dc.tipoJornada === 6) req(dc.nroResolucion && esFecha(dc.fechaResolucion), 'resolución de jornada excepcional (número y fecha)');
  if (![6, 7].includes(dc.tipoJornada)) req(dc.duracion >= 1 && dc.duracion <= 180, 'duración de la jornada (1 a 180 horas)');
  if ([1, 2, 5, 8, 9].includes(dc.tipoJornada)) {
    req(dc.colacion === 0 || (dc.colacion >= 30 && dc.colacion <= 240), 'tiempo de colación (0, o entre 30 y 240 minutos)');
    const hs = horasSemana(dc);
    req(hs.dias > 0, 'horario de trabajo (al menos un día)');
    if (hs.dias && [1, 2, 8, 9].includes(dc.tipoJornada) && Math.abs(hs.horas - dc.duracion) > 0.5) avi.push(`el horario suma ${String(hs.horas).replace('.', ',')} h semanales y la jornada pactada es ${dc.duracion} h`);
  }
  if (dc.subcontratacion) req(rutContratoDT(dc.rutPrincipal), 'RUT de la empresa principal (subcontratación)');
  if (dc.gratForma === 3) req(String(dc.gratModalidad).trim(), 'modalidad de la gratificación convencional');
  return { ok: !err.length, faltan: err, avisos: avi, dc };
}

/** Fila del CSV. `imponible`: total imponible de un mes completo (de calcularLiquidacion). */
export function filaContrato(t: Trabajador, D: Defaults, imponible: number) {
  const dc = datosContrato(t, D), r: Record<string, string> = {}; COLUMNAS.forEach((k) => (r[k] = ''));
  const apellidos = [t.apellidoPaterno, t.apellidoMaterno].filter(Boolean).join(' ');
  const disc = String(t.lre && t.lre.discapacidad);
  Object.assign(r, {
    CATEGORIA_CONTRATO: '1', COMUNA_CELEBRACION: String(dc.comunaCelebracion || ''), FECHA_SUSCRPCION: fDT(dc.fechaSuscripcion),
    RUT_TRABAJADOR: dc.dni ? '' : rutContratoDT(t.rut), DNI_TRABAJADOR: dc.dni || '', FECHA_NACIMIENTO: fDT(dc.fechaNacimiento),
    NOMBRES: (t.nombres || t.nombre || '').trim(), APELLIDOS: apellidos, SEXO: t.sexo === 'F' ? '1' : (t.sexo === 'M' ? '2' : ''),
    NACIONALIDAD: String(dc.nacionalidad || ''), EMAIL: dc.email, TELEFONO: String(dc.telefono || '').replace(/[^0-9+]/g, ''),
    COMUNA: String(dc.domComuna || ''), CALLE: dc.domCalle, NUMERO: dc.domNumero, DPTO: dc.domDpto,
    DECLARACION_DISCAPACIDAD: String(disc === '1' ? 1 : 0),
    DECLARACION_INVALIDEZ: String(['2', '3'].includes(disc) ? 1 : 0),
    FUNCIONES: String(dc.funciones || '').slice(0, 300), SUBCONTRATACION: String(dc.subcontratacion ? 1 : 0),
    RUT_EMPRESA_PRINCIPAL: dc.subcontratacion ? rutContratoDT(dc.rutPrincipal) : '', EST: '0',
    ZONA_GEOGRAFICA_1: String(dc.zona1 || ''),
    SUELDO_BASE: entero(t.base), MONTO_IMPONIBLE: entero(imponible),
    GRAT_FORMA_PAGO: String(dc.gratForma), GRAT_MODALIDAD: dc.gratForma === 3 ? String(dc.gratModalidad).slice(0, 2000) : '',
    GRAT_PERIODO_PAGO: [2, 3, 4].includes(dc.gratForma) ? '1' : '',
    REM_PERIODO_PAGO: '1', REM_FECHA_PAGO: String(dc.diaPago), REM_FORMA_PAGO: String(dc.formaPago), REM_ANTICIPO: String(dc.anticipo),
    REM_AFP: String(AFP_DT_CONTRATO[t.afp as string] ?? ''), REM_SALUD: String(SALUD_DT_CONTRATO[t.salud as string] ?? ''), REM_OTROS_PACTOS: String(dc.otrosPactos || '').slice(0, 2000),
    TIPO_JORNADA: String(dc.tipoJornada), NRO_RESOLUCION: dc.tipoJornada === 6 ? String(dc.nroResolucion).slice(0, 12) : '', FECHA_RESOLUCION: dc.tipoJornada === 6 ? fDT(dc.fechaResolucion) : '',
    TIPO_CONTRATO: String(dc.tipoContrato), FECHA_INI_RELABORAL: fDT(dc.fechaInicio), FECHA_FIN_RELABORAL: dc.tipoContrato === 2 ? fDT(dc.fechaFin) : '',
  });
  const haberes: [number, number][] = [];
  if (+(t.colacion || 0)) haberes.push([30, +(t.colacion || 0)]);
  if (+(t.movilizacion || 0)) haberes.push([31, +(t.movilizacion || 0)]);
  if (+(t.otros || 0)) haberes.push([11, +(t.otros || 0)]);
  haberes.slice(0, 5).forEach(([cod, monto], i) => { r[`HABER_${i + 1}`] = String(cod); r[`MONTO_${i + 1}`] = entero(monto); r[`PER_DEVENGAMIENTO_${i + 1}`] = '5'; });
  if (![6, 7].includes(dc.tipoJornada)) { r.DURACION_JORNADA = String(dc.duracion); r.TURNOS = String(dc.turnos); }
  if ([1, 2, 5, 8, 9].includes(dc.tipoJornada)) {
    const col = +dc.colacion || 0;
    r.TIEMPO_COLACION = String(col); r.T_COLACION_IMP = String(dc.colacionImputable ? col : 0); r.T_COLACION_NO_IMP = String(dc.colacionImputable ? 0 : col);
    DIAS.forEach(([k, COL]) => {
      if (k === 'do' && ![8, 9].includes(dc.tipoJornada) && !(dc.horario.do || [])[0]) return;
      const h = dc.horario[k] || ['', '']; r[`${COL}_HORA_INICIO`] = hhmm(h[0]); r[`${COL}_HORA_TERMINO`] = hhmm(h[1]);
    });
  }
  if ([1, 2, 8, 9].includes(dc.tipoJornada)) r.ROTACION = String(dc.turnos);
  ['OTROS_INDEMNIZACIONES', 'OTROS_FERIADOS', 'OTROS_NEGOCIACIONES', 'OTROS_PROPINTELECTUAL', 'OTROS_LICMEDICA',
    'OTROS_SALACUNA', 'OTROS_PERMISOS', 'OTROS_CONESPECIALES', 'OTROS_SEGUROS', 'OTROS_STOCK', 'OTROS_INSTCOLECTIVO'].forEach((k) => (r[k] = '0'));
  return r;
}

const csvCampo = (v: unknown) => { const s = String(v ?? '').replace(/[\r\n;]+/g, ' ').trim(); return /"/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function csvContratos(filas: Record<string, string>[]) {
  return [COLUMNAS.join(';'), ...filas.map((r) => COLUMNAS.map((k) => csvCampo(r[k])).join(';'))].join('\r\n') + '\r\n';
}
export function nombreArchivoContratos(rutEmpresa: string, hoy: Date, sufijo = '') {
  const rut = String(rutEmpresa || '').toUpperCase().replace(/[^0-9K]/g, '');
  const per = `${hoy.getFullYear()}${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  return `${rut}_${per}${sufijo ? '_' + sufijo : ''}.csv`;
}
/** Un archivo por cargo (exigencia de la carga masiva de la DT). */
export function gruposPorCargo<T extends { cargo?: string }>(trabs: T[]) {
  const grupos = new Map<string, T[]>();
  trabs.forEach((t) => { const k = String(t.cargo || 'sin cargo').trim() || 'sin cargo'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(t); });
  const varios = grupos.size > 1;
  return [...grupos.entries()].map(([cargo, lista]) => ({ cargo, lista, sufijo: varios ? normDT(cargo).toLowerCase().replace(/\s+/g, '_').slice(0, 30) : '' }));
}

/** Plazo de registro: 15 días hábiles desde la suscripción (aproximado, lunes a viernes). */
export function venceRegistro(iso: string) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return '';
  const d = new Date(+m[1], +m[2] - 1, +m[3]); let n = 0;
  while (n < 15) { d.setDate(d.getDate() + 1); const w = d.getDay(); if (w !== 0 && w !== 6) n++; }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
