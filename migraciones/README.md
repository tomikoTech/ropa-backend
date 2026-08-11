# Migraciones

## Dónde va lo nuevo

**En `src/migrations/`, como migración de TypeORM.** El backend corre las
migraciones pendientes solo al arrancar fuera de local (`migrationsRun` en
`src/config/database.config.ts`), así que una migración nueva se aplica sola con
el despliegue y no hay ningún paso manual que se pueda olvidar.

```bash
npm run migration:create -- src/migrations/NombreDescriptivo
npm run migration:run          # local, contra la base de desarrollo
```

Escríbelas **aditivas e idempotentes** (`ADD COLUMN IF NOT EXISTS`,
`CREATE TABLE IF NOT EXISTS`, bloques `DO $$` que revisen antes de crear). No es
una formalidad: producción y desarrollo no siempre están en el mismo punto, y
una migración que falla al re-ejecutarse **tumba el arranque del backend**.

## Qué son estos `.sql`

Son las migraciones de la etapa en que el esquema se aplicaba a mano, corriendo
cada archivo con `psql` antes de desplegar. Quedan aquí como **referencia
histórica y documentación**: cada uno explica por qué existe lo que crea.

Todos están embebidos, en el orden en que se aplicaron, en la migración
`src/migrations/1785800000000-LegacyManualSchema.ts`. En una base donde ya se
corrieron a mano (producción) esa migración no cambia nada; en una base nueva,
crea todo. **No agregues archivos nuevos a esta carpeta.**

## Lo que todavía no está en migraciones

El **esquema base** (users, products, sales, stock…) nunca estuvo en una
migración: nació de `synchronize: true`, que sigue activo solo en local. Por eso
una base completamente vacía no se levanta con `migration:run` a secas; hoy el
camino es arrancar en local (synchronize crea el esquema) y de ahí en adelante
todo cambio va por migración. Generar ese baseline es un pendiente conocido.

## Cómo probar una migración antes de desplegarla

Clona la base de desarrollo y córrela ahí; es lo más parecido a producción que
hay a mano:

```bash
dropdb ropa_mig_test 2>/dev/null; createdb -T ropa_pos ropa_mig_test
npm run build
DATABASE_PUBLIC_URL= DATABASE_URL= DB_HOST=/tmp DB_PORT=5432 \
  DB_DATABASE=ropa_mig_test DB_USERNAME=$USER DB_PASSWORD= DB_SSL=false \
  ./node_modules/.bin/typeorm migration:run -d dist/config/data-source.js
```

Córrela **dos veces**: la segunda tiene que decir "No migrations are pending" y
no fallar.
