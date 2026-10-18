// Contrato de trabajo desde plantillas por cargo: traslado fiel de contratos-trabajo.js.
// Los marcadores {{campo}} se llenan con la ficha y con los datos del registro DT,
// así el contrato y el registro en la DT dicen lo mismo.

import type { Trabajador } from './calculo';
import { datosContrato, type Defaults } from './contrato-dt';
import { DT_COMUNAS, DT_NACIONALIDADES } from './contratos-dt-tablas';
import { numeroALetras } from '@/lib/numletras';

const MESES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const esFecha = (s: unknown): s is string => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const fechaLarga = (s: unknown) => { if (!esFecha(s)) return ''; const [y, m, d] = s.split('-').map(Number); return `${d} de ${MESES_L[m - 1]} de ${y}`; };
const pesos = (v: unknown) => '$' + Math.round(+(v as number) || 0).toLocaleString('es-CL');
const palabras = (v: unknown) => { const t = numeroALetras(Math.round(+(v as number) || 0)); return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; };
const titulo = (s: unknown) => String(s || '').toLowerCase().replace(/(^|\s|-)\S/g, (c) => c.toUpperCase());
const norm = (s: unknown) => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

export const MARCADORES_CONTRATO: [string, string][] = [
  ['ciudad','Ciudad donde se firma'],['fecha_contrato','Fecha de firma (en palabras)'],
  ['empresa','Razón social del empleador'],['rut_empresa','RUT del empleador'],['giro','Giro del empleador'],
  ['domicilio_empresa','Domicilio del empleador'],['representante','Representante legal'],['rut_representante','RUT del representante'],
  ['trabajador','Nombre completo del trabajador'],['rut_trabajador','RUT (o DNI) del trabajador'],['nacionalidad','Nacionalidad'],
  ['fecha_nacimiento','Fecha de nacimiento (en palabras)'],['domicilio_trabajador','Domicilio del trabajador'],
  ['email_trabajador','Email del trabajador'],['telefono_trabajador','Teléfono del trabajador'],
  ['cargo','Cargo'],['funciones','Funciones pactadas'],['lugar_trabajo','Comuna donde se prestan los servicios'],
  ['fecha_inicio','Fecha de inicio de la relación laboral'],['fecha_termino','Fecha de término (plazo fijo)'],['tipo_contrato','Tipo de contrato'],
  ['sueldo_base','Sueldo base'],['sueldo_base_palabras','Sueldo base en palabras'],['gratificacion','Cláusula de gratificación según lo pactado'],
  ['colacion','Asignación de colación'],['movilizacion','Asignación de movilización'],['otros_haberes','Otros haberes imponibles fijos'],
  ['beneficios','Colación, movilización y otros haberes en una frase'],['remuneracion_imponible','Remuneración imponible mensual'],
  ['dia_pago','Día de pago'],['forma_pago','Forma de pago'],['anticipo','Anticipo pactado'],
  ['jornada_horas','Horas semanales'],['jornada_tipo','Tipo de jornada'],['distribucion_jornada','Días y horario de trabajo'],
  ['colacion_minutos','Minutos de colación'],['turno','Turno'],
  ['afp','AFP'],['salud','Institución de salud'],['otros_pactos','Otros pactos'],
];
const AFP_NM: Record<string, string> ={capital:'AFP Capital',cuprum:'AFP Cuprum',habitat:'AFP Habitat',modelo:'AFP Modelo',planvital:'AFP PlanVital',provida:'AFP ProVida',uno:'AFP Uno'};
const SALUD_NM: Record<string, string> ={fonasa:'Fonasa',banmedica:'Isapre Banmédica',colmena:'Isapre Colmena Golden Cross',consalud:'Isapre Consalud',cruzblanca:'Isapre Cruz Blanca',esencial:'Isapre Esencial',nuevamasvida:'Isapre Nueva Masvida',vidatres:'Isapre Vida Tres',fundacion:'Isapre Fundación'};
const GENTILICIO: Record<string, string> ={CHILE:'chilena',PERU:'peruana',ARGENTINA:'argentina',BOLIVIA:'boliviana',VENEZUELA:'venezolana',COLOMBIA:'colombiana',HAITI:'haitiana',ECUADOR:'ecuatoriana',BRASIL:'brasileña',PARAGUAY:'paraguaya',URUGUAY:'uruguaya','REPUBLICA DOMINICANA':'dominicana',CUBA:'cubana',ESPAÑA:'española'};
const DIAS_L: [string, string][] =[['lu','lunes'],['ma','martes'],['mi','miércoles'],['ju','jueves'],['vi','viernes'],['sa','sábado'],['do','domingo']];
const TIPOS_JORNADA_L: Record<number, string> ={1:'semanal ordinaria',2:'semanal extendida',3:'bisemanal',4:'mensual',5:'diaria',6:'excepcional',7:'sin límite de jornada (artículo 22 inciso segundo del Código del Trabajo)',8:'semanal ordinaria (artículo 38)',9:'semanal extendida (artículo 38)'};
const FORMAS_PAGO_L: Record<number, string> ={1:'en dinero efectivo',2:'mediante cheque',3:'mediante vale vista',4:'mediante depósito en la cuenta bancaria del trabajador',5:'mediante transferencia electrónica a la cuenta bancaria del trabajador'};
const ANTICIPOS_L: Record<number, string> ={1:'',2:'por hora',3:'diario',4:'semanal',5:'quincenal'};
const TURNOS_L: Record<number, string> ={1:'horario fijo, sin sistema de turnos',2:'turno de mañana',3:'turno de tarde',4:'turno de noche'};


/** "lunes a jueves de 08:00 a 17:30 horas y viernes de 08:00 a 16:30 horas" */
export function textoHorario(h: Record<string, string[] | undefined>) {
  const dias = DIAS_L.map(([k, nm]) => ({ nm, ini: (h[k] || [])[0] || '', fin: (h[k] || [])[1] || '' })).filter((d) => d.ini && d.fin);
  if (!dias.length) return '';
  const grupos: { desde: string; hasta: string; ini: string; fin: string; idxFin: number }[] = [];
  dias.forEach((d) => {
    const ult = grupos[grupos.length - 1]; const idx = DIAS_L.findIndex((x) => x[1] === d.nm);
    if (ult && ult.ini === d.ini && ult.fin === d.fin && ult.idxFin === idx - 1) { ult.hasta = d.nm; ult.idxFin = idx; }
    else grupos.push({ desde: d.nm, hasta: d.nm, ini: d.ini, fin: d.fin, idxFin: idx });
  });
  const partes = grupos.map((gr) => `${gr.desde === gr.hasta ? gr.desde : `${gr.desde} a ${gr.hasta}`} de ${gr.ini} a ${gr.fin} horas`);
  return partes.length > 1 ? partes.slice(0, -1).join(', ') + ' y ' + partes[partes.length - 1] : partes[0];
}
function gentilicio(cd: unknown) {
  const nm = DT_NACIONALIDADES.find((x) => x.cd === +(cd as number))?.nm || '';
  return GENTILICIO[nm] || (nm ? titulo(nm) : '');
}
function clausulaGratificacion(dc: { gratForma: number; gratModalidad: string }) {
  switch (+dc.gratForma) {
    case 4: return 'El empleador pagará al trabajador una gratificación anual equivalente al veinticinco por ciento de lo devengado en el respectivo ejercicio comercial por concepto de remuneraciones mensuales, con un tope de cuatro coma setenta y cinco ingresos mínimos mensuales, conforme al artículo 50 del Código del Trabajo. Esta gratificación se anticipará mensualmente, a cuenta de la que corresponda al término del ejercicio';
    case 2: return 'El empleador pagará al trabajador la gratificación que le corresponda conforme al artículo 47 del Código del Trabajo, en proporción a sus remuneraciones anuales';
    case 3: return `Las partes acuerdan la siguiente gratificación convencional, que no es inferior a la legal: ${dc.gratModalidad || '(describir la modalidad pactada)'}`;
    case 5: return 'El empleador no está afecto a la obligación legal de pagar gratificación';
    default: return 'En materia de gratificación se aplicarán las normas legales vigentes';
  }
}

export interface EmpresaDocContrato { nombre?: string; rut?: string; giro?: string; domicilio?: string; comuna?: string; ciudad?: string; rep?: string; rutrep?: string }
/** Valores de los marcadores para un trabajador. `imponible`: total imponible de un mes completo. */
export function valoresContrato(t: Trabajador, D: Defaults, E: EmpresaDocContrato, imponible: number): Record<string, string> {
  const dc = datosContrato(t, D);
  const comuna = (cd: unknown) => titulo(DT_COMUNAS.find((x) => x.cd === +(cd as number))?.nm || '');
  const benef: string[] = [];
  if (+(t.colacion || 0)) benef.push(`una asignación de colación de ${pesos(t.colacion)} mensuales`);
  if (+(t.movilizacion || 0)) benef.push(`una asignación de movilización de ${pesos(t.movilizacion)} mensuales`);
  if (+(t.otros || 0)) benef.push(`otros haberes imponibles fijos por ${pesos(t.otros)} mensuales`);
  const domTrab = [[dc.domCalle, dc.domNumero].filter(Boolean).join(' '), dc.domDpto ? 'depto. ' + dc.domDpto : '', comuna(dc.domComuna)].filter(Boolean).join(', ');
  const nombre = [t.nombres, t.apellidoPaterno, t.apellidoMaterno].filter(Boolean).join(' ') || t.nombre || '';
  const ant = ANTICIPOS_L[+dc.anticipo] || '';
  return {
    ciudad: E.ciudad || comuna(dc.comunaCelebracion) || E.comuna || '', fecha_contrato: fechaLarga(dc.fechaSuscripcion),
    empresa: E.nombre || '', rut_empresa: E.rut || '', giro: E.giro || '',
    domicilio_empresa: [E.domicilio, E.comuna || E.ciudad].filter(Boolean).join(', '),
    representante: E.rep || '', rut_representante: E.rutrep || '',
    trabajador: String(nombre).toUpperCase(), rut_trabajador: dc.dni ? `DNI ${dc.dni}` : (t.rut || ''),
    nacionalidad: gentilicio(dc.nacionalidad), fecha_nacimiento: fechaLarga(dc.fechaNacimiento),
    domicilio_trabajador: domTrab, email_trabajador: dc.email || '', telefono_trabajador: dc.telefono || '',
    cargo: t.cargo || '', funciones: dc.funciones || t.cargo || '', lugar_trabajo: comuna(dc.zona1),
    fecha_inicio: fechaLarga(dc.fechaInicio), fecha_termino: fechaLarga(dc.fechaFin),
    tipo_contrato: ({ 1: 'indefinido', 2: 'a plazo fijo', 3: 'por obra o faena' } as Record<number, string>)[dc.tipoContrato] || '',
    sueldo_base: pesos(t.base), sueldo_base_palabras: palabras(t.base),
    gratificacion: clausulaGratificacion(dc),
    colacion: +(t.colacion || 0) ? pesos(t.colacion) : '', movilizacion: +(t.movilizacion || 0) ? pesos(t.movilizacion) : '', otros_haberes: +(t.otros || 0) ? pesos(t.otros) : '',
    beneficios: benef.length ? 'Además, el empleador pagará al trabajador ' + (benef.length > 1 ? benef.slice(0, -1).join(', ') + ' y ' + benef[benef.length - 1] : benef[0]) + ', asignaciones que no constituyen remuneración conforme al artículo 41 del Código del Trabajo en la parte que corresponda.' : '',
    remuneracion_imponible: pesos(imponible),
    dia_pago: String(dc.diaPago || ''), forma_pago: FORMAS_PAGO_L[+dc.formaPago] || '',
    anticipo: ant ? `Las partes pactan un anticipo ${ant} de remuneraciones, que se descontará en la liquidación del mes.` : '',
    jornada_horas: String(dc.duracion || ''), jornada_tipo: TIPOS_JORNADA_L[+dc.tipoJornada] || '',
    distribucion_jornada: textoHorario(dc.horario || {}), colacion_minutos: String(dc.colacion || 0), turno: TURNOS_L[+dc.turnos] || '',
    afp: AFP_NM[t.afp as string] || t.afp || '', salud: SALUD_NM[t.salud as string] || t.salud || '', otros_pactos: dc.otrosPactos || '',
  };
}

// ── Plantillas tipo ──
const CLAUSULA_JORNADA = `SEGUNDO: JORNADA DE TRABAJO. La jornada ordinaria de trabajo será de {{jornada_horas}} horas semanales, de tipo {{jornada_tipo}}, distribuidas de {{distribucion_jornada}}, con {{colacion_minutos}} minutos de colación que no se imputan a la jornada, en {{turno}}. Las horas extraordinarias sólo podrán trabajarse previo pacto escrito y se pagarán con el recargo legal.`;
const CLAUSULA_REMUNERACION = `TERCERO: REMUNERACIÓN. El trabajador percibirá un sueldo base mensual de {{sueldo_base}} ({{sueldo_base_palabras}}), que se pagará por mes vencido el día {{dia_pago}} de cada mes o el día hábil anterior, {{forma_pago}}. De las remuneraciones se deducirán los impuestos, las cotizaciones de seguridad social y los demás descuentos legales o autorizados por escrito por el trabajador. {{anticipo}}

CUARTO: GRATIFICACIÓN Y BENEFICIOS. {{gratificacion}}. {{beneficios}}`;
const CLAUSULAS_FINALES = `SÉPTIMO: PREVISIÓN Y SALUD. El trabajador declara estar afiliado a {{afp}} y a {{salud}}, instituciones a las que el empleador enterará las cotizaciones que correspondan.

OCTAVO: REGLAMENTO INTERNO Y PROTOCOLO. El trabajador declara recibir en este acto un ejemplar del Reglamento Interno de Orden, Higiene y Seguridad y del protocolo de prevención del acoso sexual, laboral y la violencia en el trabajo (Ley N° 21.643), y se obliga a cumplirlos.

NOVENO: OTROS PACTOS. Las partes no acuerdan otros pactos distintos de los señalados en este contrato. {{otros_pactos}}

DÉCIMO: EJEMPLARES. El presente contrato se firma en dos ejemplares de igual tenor, quedando uno en poder de cada parte. El trabajador declara recibir su ejemplar a entera conformidad.`;
const ENCABEZADO = `En {{ciudad}}, a {{fecha_contrato}}, entre {{empresa}}, RUT {{rut_empresa}}, giro {{giro}}, representada por {{representante}}, RUT {{rut_representante}}, ambos con domicilio en {{domicilio_empresa}}, en adelante "el empleador", y don(ña) {{trabajador}}, RUT {{rut_trabajador}}, de nacionalidad {{nacionalidad}}, nacido(a) el {{fecha_nacimiento}}, con domicilio en {{domicilio_trabajador}}, en adelante "el trabajador", se ha convenido el siguiente contrato de trabajo:`;
export interface PlantillaContrato { id: string; nombre: string; tipoContrato: number | ''; cargos: string; texto: string; tipo?: boolean; editada?: boolean; uuid?: string }
export const PLANTILLAS_CONTRATO_TIPO: PlantillaContrato[] = [
  { id: 'indefinido',nombre:'Contrato indefinido · general',tipoContrato:1,cargos:'',texto:`CONTRATO DE TRABAJO

${ENCABEZADO}

PRIMERO: NATURALEZA DE LOS SERVICIOS. El trabajador se obliga a desempeñarse como {{cargo}}, realizando las siguientes funciones: {{funciones}}. Los servicios se prestarán en la comuna de {{lugar_trabajo}}, sin perjuicio de que el empleador pueda alterar la naturaleza de los servicios o el sitio en que deban prestarse dentro del mismo lugar o ciudad, en los términos del artículo 12 del Código del Trabajo.

${CLAUSULA_JORNADA}

${CLAUSULA_REMUNERACION}

QUINTO: OBLIGACIONES DEL TRABAJADOR. El trabajador se obliga a cumplir fielmente las labores convenidas, las instrucciones de su jefatura y las normas de higiene y seguridad, y a guardar reserva de la información de la empresa a que tenga acceso con motivo de su trabajo.

SEXTO: DURACIÓN. El presente contrato es de duración indefinida. El trabajador ingresó a prestar servicios el {{fecha_inicio}}.

${CLAUSULAS_FINALES}`},
  { id: 'plazo',nombre:'Contrato a plazo fijo',tipoContrato:2,cargos:'',texto:`CONTRATO DE TRABAJO A PLAZO FIJO

${ENCABEZADO}

PRIMERO: NATURALEZA DE LOS SERVICIOS. El trabajador se obliga a desempeñarse como {{cargo}}, realizando las siguientes funciones: {{funciones}}, en la comuna de {{lugar_trabajo}}.

${CLAUSULA_JORNADA}

${CLAUSULA_REMUNERACION}

QUINTO: OBLIGACIONES DEL TRABAJADOR. El trabajador se obliga a cumplir fielmente las labores convenidas, las instrucciones de su jefatura y las normas de higiene y seguridad.

SEXTO: DURACIÓN. El presente contrato regirá desde el {{fecha_inicio}} hasta el {{fecha_termino}}, fecha en que terminará por vencimiento del plazo convenido, conforme al artículo 159 N° 4 del Código del Trabajo. Si el trabajador continúa prestando servicios con conocimiento del empleador después de esa fecha, el contrato se transformará en indefinido en los casos que señala la ley.

${CLAUSULAS_FINALES}`},
  { id: 'obra',nombre:'Contrato por obra o faena',tipoContrato:3,cargos:'',texto:`CONTRATO DE TRABAJO POR OBRA O FAENA

${ENCABEZADO}

PRIMERO: NATURALEZA DE LOS SERVICIOS. El trabajador se obliga a desempeñarse como {{cargo}} en la siguiente obra o faena: {{funciones}}, que se ejecutará en la comuna de {{lugar_trabajo}}.

${CLAUSULA_JORNADA}

${CLAUSULA_REMUNERACION}

QUINTO: OBLIGACIONES DEL TRABAJADOR. El trabajador se obliga a cumplir fielmente las labores convenidas, las instrucciones de su jefatura y las normas de higiene y seguridad propias de la faena.

SEXTO: DURACIÓN. El presente contrato regirá desde el {{fecha_inicio}} y durará hasta la conclusión de la obra o faena señalada en la cláusula primera, conforme al artículo 159 N° 5 del Código del Trabajo. Al término, el trabajador tendrá derecho a la indemnización que corresponda según el artículo 163 bis del mismo código.

${CLAUSULAS_FINALES}`},
  { id: 'temporada',nombre:'Trabajador agrícola de temporada',tipoContrato:3,cargos:'Temporero, Cosechero, Trabajador agrícola de temporada',texto:`CONTRATO DE TRABAJO AGRÍCOLA DE TEMPORADA

${ENCABEZADO}

PRIMERO: NATURALEZA DE LOS SERVICIOS. El trabajador se obliga a desempeñarse como {{cargo}} en labores agrícolas de temporada, en especial: {{funciones}}, en los predios del empleador ubicados en la comuna de {{lugar_trabajo}}. Este contrato se rige por los artículos 93 y siguientes del Código del Trabajo.

${CLAUSULA_JORNADA}

${CLAUSULA_REMUNERACION}

QUINTO: CONDICIONES DE TRABAJO. El empleador proporcionará al trabajador condiciones higiénicas y adecuadas para mantener, preparar y consumir sus alimentos, y los elementos de protección personal que requieran las labores. El trabajador se obliga a usarlos y a cumplir las normas de seguridad en la aplicación de productos fitosanitarios.

SEXTO: DURACIÓN. El presente contrato regirá desde el {{fecha_inicio}} y durará hasta el término de la temporada o de las labores señaladas en la cláusula primera, conforme al artículo 159 N° 5 del Código del Trabajo.

${CLAUSULAS_FINALES}`},
];

export interface PlantillaContratoGuardada { id: string; codigo: string; nombre: string; cargos: string; tipo_contrato: number | null; texto: string }
/** Propias primero (igual que el sistema actual), luego las tipo con su versión editada. */
export function plantillasContrato(guardadas: PlantillaContratoGuardada[]): PlantillaContrato[] {
  const tipo = PLANTILLAS_CONTRATO_TIPO.map((p) => { const ed = guardadas.find((x) => x.codigo === p.id); return ed ? { ...p, nombre: ed.nombre, cargos: ed.cargos, texto: ed.texto, tipo: true, editada: true, uuid: ed.id } : { ...p, tipo: true }; });
  const propias = guardadas.filter((x) => !PLANTILLAS_CONTRATO_TIPO.some((p) => p.id === x.codigo))
    .map((x) => ({ id: x.codigo, nombre: x.nombre, cargos: x.cargos || '', tipoContrato: (x.tipo_contrato || '') as number | '', texto: x.texto, tipo: false, uuid: x.id }));
  return [...propias, ...tipo];
}
const cargosDe = (p: PlantillaContrato) => String(p.cargos || '').split(/[,;\n]/).map(norm).filter(Boolean);
/** La guardada para el trabajador, la de su cargo o la de su tipo de contrato. */
export function plantillaSugerida(t: Trabajador, D: Defaults, pls: PlantillaContrato[], guardadaId?: string | null) {
  const porId = guardadaId ? pls.find((p) => p.id === guardadaId) : null; if (porId) return porId;
  const cargo = norm(t.cargo);
  const porCargo = cargo && pls.find((p) => cargosDe(p).includes(cargo)); if (porCargo) return porCargo;
  const tc = datosContrato(t, D).tipoContrato;
  return pls.find((p) => +p.tipoContrato === tc && p.tipo) || pls.find((p) => +p.tipoContrato === tc) || PLANTILLAS_CONTRATO_TIPO[0];
}

// Opcionales: si están vacíos desaparecen sin aviso (cláusulas que sólo existen si se pactaron)
const OPCIONALES = new Set(['anticipo', 'beneficios', 'otros_pactos', 'otros_haberes', 'colacion', 'movilizacion', 'email_trabajador', 'telefono_trabajador', 'fecha_termino', 'giro']);
/** Reemplaza marcadores; un dato vacío no opcional queda como [dato] para que se note. */
export function combinarContrato(texto: string, vals: Record<string, string>) {
  return String(texto || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (m, k: string) => { k = k.toLowerCase(); if (!(k in vals)) return m; return vals[k] || (OPCIONALES.has(k) ? '' : `[${k.replace(/_/g, ' ')}]`); });
}
/** Marcadores usados en el texto que quedarían vacíos. */
export function faltantesContrato(texto: string, vals: Record<string, string>) {
  const usados = new Set([...String(texto || '').matchAll(/\{\{\s*([a-z_]+)\s*\}\}/gi)].map((m) => m[1].toLowerCase()));
  return [...usados].filter((k) => k in vals && !vals[k] && !OPCIONALES.has(k)).map((k) => (MARCADORES_CONTRATO.find((x) => x[0] === k) || [k, k])[1]);
}

// ── Validación de plantillas (al editar o volver a subir el Word) ──
export const ESENCIALES = ['ciudad', 'fecha_contrato', 'empresa', 'rut_empresa', 'trabajador', 'rut_trabajador', 'nacionalidad', 'fecha_nacimiento',
  'cargo', 'lugar_trabajo', 'sueldo_base', 'jornada_horas', 'distribucion_jornada', 'fecha_inicio'];
const CONOCIDOS = new Set(MARCADORES_CONTRATO.map((m) => m[0]));
function distancia(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function sugerir(k: string) { let mejor: string | null = null, dm = 99; CONOCIDOS.forEach((c) => { const dd = distancia(k, c); if (dd < dm) { dm = dd; mejor = c; } }); return dm <= 3 ? mejor : null; }
export function validarPlantilla(texto: string, original?: string | null) {
  const t = String(texto || ''); const errores: string[] = [], avisos: string[] = [];
  const usados = [...t.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].map((m) => m[1]);
  const validos = new Set<string>();
  usados.forEach((k) => {
    const kk = k.toLowerCase().replace(/\s+/g, '_');
    if (CONOCIDOS.has(k)) validos.add(k);
    else { const sg = CONOCIDOS.has(kk) ? kk : sugerir(kk); errores.push(`{{${k}}} no es un marcador válido${sg ? `; ¿quisiste decir {{${sg}}}?` : ''}`); }
  });
  const resto = t.replace(/\{\{\s*[^{}]*?\s*\}\}/g, '');
  const rotos = [...resto.matchAll(/.{0,25}[{}].{0,25}/g)].map((m) => m[0].replace(/\s+/g, ' ').trim());
  rotos.slice(0, 5).forEach((r) => errores.push(`Marcador incompleto o llave suelta: "…${r}…"`));
  if (rotos.length > 5) errores.push(`… y ${rotos.length - 5} llave(s) suelta(s) más`);
  const faltanEsenciales = ESENCIALES.filter((k) => !validos.has(k));
  if (faltanEsenciales.length) avisos.push(`No están los marcadores de datos esenciales del contrato (Art. 10 del Código del Trabajo): ${faltanEsenciales.map((k) => `{{${k}}}`).join(', ')}. Esos datos no se llenarán solos.`);
  if (original) {
    const antes = new Set([...String(original).matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]));
    const quitados = [...antes].filter((k) => !validos.has(k) && !faltanEsenciales.includes(k));
    if (quitados.length) avisos.push(`Se quitaron marcadores que tenía la plantilla: ${quitados.map((k) => `{{${k}}}`).join(', ')}.`);
  }
  if (!t.trim()) errores.push('La plantilla no tiene texto.');
  return { ok: !errores.length, errores, avisos, usados: [...validos] };
}
