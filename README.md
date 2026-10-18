# Contabilidad ME · versión Next.js + PostgreSQL (Supabase)

Proyecto **nuevo e independiente** del sistema actual. El sistema de GitHub Pages + Firebase no se toca y sigue siendo el oficial hasta que esta versión cuadre en paralelo.

## Estado: fase 0 (fundaciones)

| Pieza | Estado |
|---|---|
| Base PostgreSQL con aislamiento por empresa (RLS) | ✅ |
| Asientos con correlativo atómico, cuadratura, cuentas imputables, auxiliares y centros de costo validados **en la base** | ✅ |
| Anulación (conserva el N°, excluye saldos) y cierre/reapertura de períodos | ✅ |
| Roles por empresa: admin / contador / consulta | ✅ |
| Login con Supabase Auth: ingreso, registro, recuperación de contraseña | ✅ |
| Selector de empresas, creación de empresa con plan de cuentas base (295 cuentas) | ✅ |
| Plan de cuentas, libro diario, nuevo asiento manual | ✅ |
| Motor contable (compras, ventas, honorarios) en TypeScript, idéntico al actual | ✅ 29 casos verificados contra el motor actual |
| Compras, ventas, honorarios, remuneraciones, reportes, importadores | Fases siguientes |

## 1. Crear el proyecto en Supabase (una vez)

1. Entra a <https://supabase.com>, crea una cuenta y luego **New project**:
   - Plan: Free.
   - Región: **South America (São Paulo)**.
   - Guarda la contraseña de la base en un lugar seguro.
2. En **SQL Editor**, ejecuta **en orden** el contenido de:
   1. `supabase/migrations/20261017000001_esquema_base.sql`
   2. `supabase/migrations/20261017000002_pdc_plantilla.sql`

   Si usas la CLI de Supabase, también sirve `supabase link` + `supabase db push`.
3. En **Authentication → URL Configuration**:
   - Site URL: `http://localhost:3000` mientras pruebas. Cuando publiques, cámbiala por la URL de Vercel.
   - Redirect URLs: agrega `http://localhost:3000/**` y luego `https://TU-APP.vercel.app/**`.
4. Recomendado: en **Authentication → Email Templates**, cambia el enlace de estas dos plantillas para que los correos funcionen aunque se abran en otro navegador:
   - Confirm signup: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/empresas`
   - Reset password: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/auth/actualizar-clave`
5. En **Project Settings → API Keys**, copia la **Project URL** y la **Publishable key**.

> El plan gratis pausa el proyecto tras 7 días sin uso. Se reactiva desde el panel y los datos no se pierden.

## 2. Correr en tu computador

Necesitas Node.js 20.9 o superior.

```bash
npm install
cp .env.example .env.local   # completa URL y publishable key
npm run dev                  # http://localhost:3000
```

Crea tu cuenta en `/registro`, confirma el correo y luego crea tu primera empresa. Quedarás como administrador.

Para sumar a otra persona: primero ella crea su cuenta. Después, un administrador ejecuta en el SQL Editor (la pantalla para esto viene en la fase siguiente):

```sql
select agregar_miembro('<id-empresa>', 'correo@persona.cl', 'contador');
```

Esa línea solo funciona estando logueado en la app, porque usa `auth.uid()`. Desde el SQL Editor usa en su lugar:

```sql
insert into miembros (empresa_id, usuario_id, rol)
select '<id-empresa>', id, 'contador' from auth.users where email = 'correo@persona.cl';
```

## 3. Publicar (GitHub + Vercel)

GitHub guarda el código; **GitHub Pages no sirve para esta versión** porque Next.js necesita un servidor (login, acciones, proxy). Vercel lo publica gratis y se actualiza solo con cada push.

Cada push a `main` corre además la verificación automática en GitHub Actions (`.github/workflows/ci.yml`): lint, pruebas y build.


1. Sube esta carpeta a un **repositorio nuevo** de GitHub (no al del sistema actual).
2. En <https://vercel.com>, haz **Add New → Project** y elige el repositorio.
3. Agrega las variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `NEXT_PUBLIC_SITE_URL`, con la URL final.
4. Despliega. Después agrega esa URL en Supabase (paso 1.3).

## Pruebas

```bash
npm test          # motor contable (29 casos de oro) + base de datos en PGlite (RLS, correlativos, anulación)
npm run typecheck
npm run lint
```

Las pruebas de base de datos levantan un PostgreSQL embebido (PGlite) con las migraciones reales, así que no necesitan Supabase.

## Estructura

```
supabase/migrations/   Esquema SQL, RLS y funciones (crear_empresa, crear_asiento, anular_asiento, cerrar_periodo…)
db/__tests__/          Pruebas SQL con PGlite
src/motor/             Lógica contable pura (traslado 1:1 del sistema actual) + casos de oro
src/lib/               Supabase (servidor/proxy), sesión y empresa activa, formatos CLP
src/proxy.ts           Refresca la sesión y protege rutas
src/app/(auth)/        Ingreso, registro, recuperación
src/app/(app)/         Empresas y módulos por empresa (/e/[empresaId]/…)
scripts/               Generador del plan de cuentas base
```

## Principios

- **La base es la autoridad.** Aunque alguien salte la interfaz, PostgreSQL rechaza asientos descuadrados, cuentas agrupadoras, períodos cerrados o accesos a otra empresa.
- **Nunca se borra un asiento numerado.** Se anula con motivo y queda en auditoría.
- **Mismo resultado que el sistema actual.** Cada cálculo migrado se compara contra salidas reales del motor actual antes de darlo por bueno.
