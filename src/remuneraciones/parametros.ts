// Parámetros de remuneraciones: valores de referencia del sistema actual (indicadores.js y
// previsional.js, Previred oct-2026). Cada empresa puede sobrescribirlos.

export interface TramoIUSC { desde: number; hasta: number; factor: number; rebajaUTM: number }
export interface Institucion { k: string; nm: string; comision?: number }
export interface TramoReforma { desde: string; capInd: number; cev: number | null; crp: number }

export type Indicadores = Record<string, number | boolean | TramoIUSC[] | undefined> & {
  uf: number; utm: number; topeAFP_UF: number; topeCesantia_UF: number; ingresoMinimo: number; gratifPct: number; gratifTopeIMM: number;
  tasaAFP: number; tasaSalud: number; tasaCesantiaTrab: number;
  asigFamA_hasta: number; asigFamA_monto: number; asigFamB_hasta: number; asigFamB_monto: number; asigFamC_hasta: number; asigFamC_monto: number;
  rentaMinimaEspecial: number; rentaMinimaCasa: number;
  tpPesadoEmp: number; tpPesadoTrab: number; tpMenosEmp: number; tpMenosTrab: number;
  iuscTabla?: TramoIUSC[];
};

export type Patronal = Record<string, number | string>;

export interface Parametros {
  ind: Indicadores;
  afps: Institucion[];
  isapres: Institucion[];
  mutuales: Institucion[];
  cajas: Institucion[];
  patronal: Patronal;
  reforma: TramoReforma[];
}

const D = {
  "ind": {
    "uf": 41247.63,
    "utm": 72151,
    "uta": 865812,
    "dolar": 933,
    "euro": 1065.07,
    "topeAFP_UF": 90,
    "topeCesantia_UF": 135.2,
    "ingresoMinimo": 553553,
    "gratifPct": 25,
    "gratifTopeIMM": 4.75,
    "tasaAFP": 10,
    "tasaSalud": 7,
    "tasaCesantiaTrab": 0.6,
    "factorCM": 3.4,
    "retHonorarios": 15.25,
    "retHonorariosManual": false,
    "asigFamA_hasta": 649039,
    "asigFamA_monto": 22601,
    "asigFamB_hasta": 947990,
    "asigFamB_monto": 13870,
    "asigFamC_hasta": 1478539,
    "asigFamC_monto": 4382,
    "rentaMinimaEspecial": 412938,
    "rentaMinimaCasa": 553553,
    "rentaMinimaNoRem": 356815,
    "tpPesadoEmp": 2,
    "tpPesadoTrab": 2,
    "tpMenosEmp": 1,
    "tpMenosTrab": 1
  },
  "afps": [
    {
      "k": "capital",
      "nm": "AFP Capital",
      "comision": 1.44
    },
    {
      "k": "cuprum",
      "nm": "AFP Cuprum",
      "comision": 1.44
    },
    {
      "k": "habitat",
      "nm": "AFP Habitat",
      "comision": 1.27
    },
    {
      "k": "modelo",
      "nm": "AFP Modelo",
      "comision": 0.58
    },
    {
      "k": "planvital",
      "nm": "AFP PlanVital",
      "comision": 1.16
    },
    {
      "k": "provida",
      "nm": "AFP ProVida",
      "comision": 1.45
    },
    {
      "k": "uno",
      "nm": "AFP Uno",
      "comision": 0.46
    }
  ],
  "isapres": [
    {
      "k": "fonasa",
      "nm": "Fonasa"
    },
    {
      "k": "banmedica",
      "nm": "Isapre Banmédica"
    },
    {
      "k": "colmena",
      "nm": "Isapre Colmena Golden Cross"
    },
    {
      "k": "consalud",
      "nm": "Isapre Consalud"
    },
    {
      "k": "cruzblanca",
      "nm": "Isapre Cruz Blanca"
    },
    {
      "k": "esencial",
      "nm": "Isapre Esencial"
    },
    {
      "k": "nuevamasvida",
      "nm": "Isapre Nueva Masvida"
    },
    {
      "k": "vidatres",
      "nm": "Isapre Vida Tres"
    },
    {
      "k": "fundacion",
      "nm": "Isapre Fundación"
    }
  ],
  "mutuales": [
    {
      "k": "achs",
      "nm": "ACHS — Asociación Chilena de Seguridad"
    },
    {
      "k": "mutual",
      "nm": "Mutual de Seguridad CChC"
    },
    {
      "k": "ist",
      "nm": "IST — Instituto de Seguridad del Trabajo"
    },
    {
      "k": "isl",
      "nm": "ISL — Instituto de Seguridad Laboral (estatal)"
    }
  ],
  "cajas": [
    {
      "k": "ninguna",
      "nm": "Sin caja de compensación"
    },
    {
      "k": "losandes",
      "nm": "Caja Los Andes"
    },
    {
      "k": "laaraucana",
      "nm": "Caja La Araucana"
    },
    {
      "k": "18septiembre",
      "nm": "Caja 18 de Septiembre"
    },
    {
      "k": "gabriela",
      "nm": "Caja Gabriela Mistral"
    }
  ],
  "patronal": {
    "sis": 1.78,
    "mutualBase": 0.9,
    "mutualAdicional": 0,
    "mutualSanna": 0.03,
    "mutualExtra": 0,
    "islBase": 0.9,
    "islAdicional": 0,
    "islSanna": 0.03,
    "islExtra": 0,
    "afcIndefinido": 2.4,
    "afcTrabIndefinido": 0.6,
    "afcPlazoFijo": 3,
    "afcTrabPlazoFijo": 0,
    "afcIndef11": 0.8,
    "afcTrabIndef11": 0,
    "cajaCompensacion": 0,
    "ccafSaludCaja": 4.2,
    "ccafSaludFonasa": 2.8,
    "mutualInstitucion": "achs",
    "cajaInstitucion": "ninguna"
  },
  "iusc": [
    {
      "desde": 0,
      "hasta": 13.5,
      "factor": 0,
      "rebajaUTM": 0
    },
    {
      "desde": 13.5,
      "hasta": 30,
      "factor": 0.04,
      "rebajaUTM": 0.54
    },
    {
      "desde": 30,
      "hasta": 50,
      "factor": 0.08,
      "rebajaUTM": 1.74
    },
    {
      "desde": 50,
      "hasta": 70,
      "factor": 0.135,
      "rebajaUTM": 4.49
    },
    {
      "desde": 70,
      "hasta": 90,
      "factor": 0.23,
      "rebajaUTM": 11.14
    },
    {
      "desde": 90,
      "hasta": 120,
      "factor": 0.304,
      "rebajaUTM": 17.8
    },
    {
      "desde": 120,
      "hasta": 310,
      "factor": 0.35,
      "rebajaUTM": 23.32
    },
    {
      "desde": 310,
      "hasta": 1000000000,
      "factor": 0.4,
      "rebajaUTM": 38.82
    }
  ],
  "reforma": [
    {
      "desde": "2025-08",
      "capInd": 0.1,
      "cev": 0.9,
      "crp": 0
    },
    {
      "desde": "2026-08",
      "capInd": 0.1,
      "cev": null,
      "crp": 0.9
    },
    {
      "desde": "2027-08",
      "capInd": 0.25,
      "cev": null,
      "crp": 1.5
    },
    {
      "desde": "2028-08",
      "capInd": 1,
      "cev": null,
      "crp": 1.5
    },
    {
      "desde": "2029-08",
      "capInd": 1.7,
      "cev": null,
      "crp": 1.5
    },
    {
      "desde": "2030-08",
      "capInd": 2.4,
      "cev": null,
      "crp": 1.5
    },
    {
      "desde": "2031-08",
      "capInd": 3.1,
      "cev": null,
      "crp": 1.5
    },
    {
      "desde": "2032-08",
      "capInd": 3.8,
      "cev": null,
      "crp": 1.5
    },
    {
      "desde": "2033-08",
      "capInd": 4.5,
      "cev": null,
      "crp": 1.5
    }
  ]
};

export const INDICADORES_DEFAULT = D.ind as Indicadores;
export const IUSC_TABLA_OFICIAL: TramoIUSC[] = D.iusc;
export const AFP_DEFAULT: Institucion[] = D.afps;
export const ISAPRES_DEFAULT: Institucion[] = D.isapres;
export const MUTUALES_DEFAULT: Institucion[] = D.mutuales;
export const CAJAS_DEFAULT: Institucion[] = D.cajas;
export const PATRONAL_DEFAULT: Patronal = D.patronal;
export const REFORMA_DEFAULT: TramoReforma[] = D.reforma;
export const SEGURO_SOCIAL_SIS_CEV = 2.5;
export const SIS_A_SEGURO_SOCIAL_DESDE = '2026-08';

export interface ParametrosGuardados {
  indicadores?: Partial<Indicadores>;
  previsional?: { afps?: Institucion[]; isapres?: Institucion[]; mutuales?: Institucion[]; cajas?: Institucion[]; patronal?: Patronal; reforma?: TramoReforma[] };
}

/** Mezcla los valores de referencia con lo guardado por la empresa (como getIndicadores/getPrevisional). */
export function parametrosVigentes(g: ParametrosGuardados = {}): Parametros {
  const ind = { ...INDICADORES_DEFAULT, ...(g.indicadores ?? {}) } as Indicadores;
  const pg = g.previsional ?? {};
  const patronal = { ...PATRONAL_DEFAULT, ...(pg.patronal ?? {}) };
  if (!pg.patronal || pg.patronal.afcTrabIndefinido === undefined) {
    if (g.indicadores?.tasaCesantiaTrab != null) patronal.afcTrabIndefinido = +g.indicadores.tasaCesantiaTrab;
  }
  return {
    ind,
    afps: pg.afps?.length ? pg.afps : AFP_DEFAULT,
    isapres: pg.isapres?.length ? pg.isapres : ISAPRES_DEFAULT,
    mutuales: pg.mutuales?.length ? pg.mutuales : MUTUALES_DEFAULT,
    cajas: pg.cajas?.length ? pg.cajas : CAJAS_DEFAULT,
    patronal,
    reforma: (pg.reforma?.length ? pg.reforma : REFORMA_DEFAULT).slice().sort((a, b) => a.desde.localeCompare(b.desde)),
  };
}

export const iuscTabla = (P: Parametros) => (Array.isArray(P.ind.iuscTabla) && P.ind.iuscTabla.length ? P.ind.iuscTabla : IUSC_TABLA_OFICIAL);
