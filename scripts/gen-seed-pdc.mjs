import fs from 'node:fs';
const pdc = JSON.parse(fs.readFileSync('src/motor/__fixtures__/pdc-base.json','utf8'));
const q = s => s==null||s==='' ? 'null' : "'" + String(s).replace(/'/g,"''") + "'";
const rows = pdc.map(c => `  (${q(c.cd)}, ${q(c.nm)}, ${q(c.tp)}, ${q(c.nat)})`);
fs.writeFileSync('supabase/migrations/20261017000002_pdc_plantilla.sql',
`-- Plan de cuentas modelo (${pdc.length} cuentas), generado desde src/motor/__fixtures__/pdc-base.json
insert into public.pdc_plantilla (codigo, nombre, tipo, naturaleza) values
${rows.join(',\n')}
on conflict (codigo) do update set nombre = excluded.nombre, tipo = excluded.tipo, naturaleza = excluded.naturaleza;
`);
console.log(pdc.length);
