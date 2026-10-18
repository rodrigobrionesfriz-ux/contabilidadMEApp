import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

// Simula lo que Supabase provee: esquema auth, auth.uid() desde el JWT y los roles.
const AUTH_STUB = `
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated nologin;
create role anon nologin;
`;

export async function baseDePrueba() {
  const db = new PGlite();
  await db.exec(AUTH_STUB);
  const dir = path.resolve(__dirname, '../../supabase/migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
  /** Ejecuta como un usuario autenticado (RLS activo). */
  async function como<T = Record<string, unknown>>(uid: string, sql: string, params: unknown[] = []) {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false); set role authenticated;`);
    try {
      return (await db.query<T>(sql, params)).rows;
    } finally {
      await db.exec('reset role;');
    }
  }
  return { db, como };
}
