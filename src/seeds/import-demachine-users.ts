/**
 * Importador de usuarios, roles y bodegas: demachine -> MiPinta.
 *
 * La migración anterior trajo el catálogo y el inventario, pero dejó a todo el
 * mundo entrando **sin restricciones**: en producción los nueve usuarios de
 * Sportcali y los cinco de AMAWAD tienen `access_role_id` en `null`, que
 * significa «puede todo». En demachine cada uno tenía su rol y sus bodegas.
 *
 * Lo que hace, de forma idempotente:
 *   1. Crea un rol de acceso por cada rol de demachine, desde la plantilla
 *      equivalente de MiPinta (ya existen las seis: administrador, gerente,
 *      cajero, jefe-bodega, inventario, consulta).
 *   2. Crea los usuarios que falten y completa el `username` de los que ya
 *      están (en demachine se entra por nombre, no por correo).
 *   3. Le asigna a cada uno **un** rol. En demachine un usuario tiene varios
 *      —César tiene los siete, «local 17» tiene Inventario, Cajero y Consulta—
 *      y aquí solo cabe uno, así que se crea un rol combinado con la **unión**
 *      de sus permisos. Quedarse con el de más alcance parecía razonable y no
 *      lo es: a «local 17» le habría dejado Inventario y le habría quitado
 *      vender, que es justo lo que hace todo el día.
 *   4. Le asigna sus bodegas.
 *
 * Lo que NO hace y es a propósito:
 *   - **No toca `users.role`** (ADMIN / COLABORADOR). Los permisos los manda el
 *     rol de acceso; cambiar el rol de sistema promovería gente sin necesidad.
 *   - **No restringe bodegas a los administradores.** Un administrador atado a
 *     dos de cinco bodegas deja de ver su propia tienda, y en demachine tampoco
 *     estaba restringido.
 *   - **No trae contraseñas**: en demachine están hasheadas. Las cuentas nuevas
 *     salen con una temporal que se imprime al final.
 *
 * OJO: asignar un rol de acceso **restringe** a quien hoy entra sin límites.
 * Es el objetivo, pero cambia el día a quien esté trabajando. Corre primero con
 * `DRY_RUN=1` y revisa la tabla que imprime.
 *
 * Uso:
 *   python3 scripts/extract-demachine-users.py sportcali Cesar 'clave' > /tmp/u.json
 *   nest build
 *   DRY_RUN=1 TENANT_SLUG=sportcali USERS_PAYLOAD=/tmp/u.json \
 *     node dist/seeds/import-demachine-users.js
 *   TENANT_SLUG=sportcali USERS_PAYLOAD=/tmp/u.json \
 *     node dist/seeds/import-demachine-users.js
 */
import { DataSource, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Tenant } from '../tenants/entities/tenant.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { AccessRole } from '../access/entities/access-role.entity.js';
import { RolePermission } from '../access/entities/role-permission.entity.js';
import { UserWarehouse } from '../access/entities/user-warehouse.entity.js';
import { Role } from '../common/enums/role.enum.js';
import {
  findRoleTemplate,
  type ModulePermission,
} from '../access/role-templates.js';
import { MODULE_KEYS } from '../access/module-registry.js';
import { esHostLocal } from '../common/utils/host-local.js';

dotenv.config();

const DRY_RUN = process.env.DRY_RUN === '1';
const TENANT_SLUG = process.env.TENANT_SLUG || '';
const PAYLOAD = process.env.USERS_PAYLOAD || '';

interface PayloadUsuario {
  id: number;
  codigo: string;
  nombre: string;
  email: string;
  creado?: string;
}
interface Payload {
  instancia: string;
  usuarios: PayloadUsuario[];
  roles: { id: number; clave: string; nombre: string }[];
  usuario_rol: { usuario: string; rol: string }[];
  usuario_bodega: { usuario: string; bodega: string }[];
}

/**
 * Rol de demachine -> plantilla de MiPinta.
 *
 * `alcance` solo ordena: da un nombre estable al rol combinado («Jefe de Bodega
 * + Cajero» y no «Cajero + Jefe de Bodega» según el orden en que vinieran las
 * filas) y decide de qué plantilla sale la descripción.
 */
const EQUIVALENCIAS: Record<string, { plantilla: string; alcance: number }> = {
  administrador: { plantilla: 'administrador', alcance: 60 },
  gerente: { plantilla: 'gerente', alcance: 50 },
  'jefe de bodega': { plantilla: 'jefe-bodega', alcance: 40 },
  inventario: { plantilla: 'inventario', alcance: 30 },
  cajero: { plantilla: 'cajero', alcance: 20 },
  consulta: { plantilla: 'consulta', alcance: 10 },
  // «Externo» no tiene plantilla equivalente: es el vendedor de afuera que
  // factura contra la tienda. Se crea con los permisos de Consulta —lo mínimo—
  // para no regalar accesos que nadie pidió; la tienda lo ajusta desde la
  // pantalla de permisos.
  externo: { plantilla: 'consulta', alcance: 5 },
};

/**
 * Cuentas que en demachine no tienen ningún rol asignado, pero cuyo **nombre**
 * dice para qué son.
 *
 * `bodega` y `cajero` en AMAWAD son de esas. Sin esto quedarían pudiendo todo,
 * que es justo el agujero que este importador viene a cerrar. Es una
 * suposición y por eso vive aquí, a la vista y en una sola línea, en vez de
 * escondida en una heurística que adivine a partir del nombre de cualquiera.
 */
const POR_NOMBRE_DE_CUENTA: Record<string, string[]> = {
  bodega: ['jefe de bodega'],
  cajero: ['cajero'],
};

/** Sin tildes, sin mayúsculas y sin espacios de más: para cruzar por nombre. */
function normalizar(s: string): string {
  return (s || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

function aUsername(s: string): string {
  return normalizar(s).replace(/[^a-z0-9]/g, '');
}

/** Contraseña temporal legible, distinta por usuario. */
function claveTemporal(): string {
  return `mp-${crypto.randomBytes(4).toString('hex')}`;
}

async function main() {
  if (!TENANT_SLUG || !PAYLOAD) {
    console.error(
      'Faltan TENANT_SLUG y USERS_PAYLOAD.\n' +
        '  TENANT_SLUG=sportcali USERS_PAYLOAD=/tmp/u.json node dist/seeds/import-demachine-users.js',
    );
    process.exit(2);
  }
  if (!fs.existsSync(PAYLOAD)) {
    console.error(`No existe el archivo ${PAYLOAD}`);
    process.exit(2);
  }
  const payload = JSON.parse(fs.readFileSync(PAYLOAD, 'utf8')) as Payload;

  const host = process.env.DB_HOST || 'localhost';
  const isLocal = esHostLocal(host);
  const ds = new DataSource({
    type: 'postgres',
    host,
    port: Number(process.env.DB_PORT) || 5432,
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities: [
      Tenant,
      User,
      Warehouse,
      AccessRole,
      RolePermission,
      UserWarehouse,
    ],
    synchronize: false,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  await ds.initialize();

  console.log(
    `\n${DRY_RUN ? '[SIMULACIÓN]' : '[APLICANDO]'} ${payload.instancia} -> tenant "${TENANT_SLUG}" en ${host}\n`,
  );

  const tenant = await ds
    .getRepository(Tenant)
    .findOne({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`No existe el tenant "${TENANT_SLUG}"`);
  const tenantId = tenant.id;

  const userRepo = ds.getRepository(User);
  const roleRepo = ds.getRepository(AccessRole);
  const permRepo = ds.getRepository(RolePermission);
  const whRepo = ds.getRepository(Warehouse);
  const userWhRepo = ds.getRepository(UserWarehouse);

  // ── 1. Roles de acceso, uno por rol de demachine ────────────────────────
  const rolesPorClave = new Map<string, AccessRole>();
  const sinEquivalencia: string[] = [];
  for (const r of payload.roles) {
    const clave = normalizar(r.nombre || r.clave);
    const eq = EQUIVALENCIAS[clave];
    if (!eq) {
      sinEquivalencia.push(r.nombre || r.clave);
      continue;
    }
    const plantilla = findRoleTemplate(eq.plantilla);
    if (!plantilla) throw new Error(`Falta la plantilla ${eq.plantilla}`);

    const nombre = r.nombre || plantilla.name;
    let rol = await roleRepo.findOne({ where: { tenantId, name: nombre } });
    if (!rol) {
      rol = roleRepo.create({
        name: nombre,
        description: plantilla.description,
        templateKey: plantilla.key,
        tenantId,
      });
      if (!DRY_RUN) {
        rol = await roleRepo.save(rol);
        await escribirPermisos(
          permRepo,
          rol.id,
          plantilla.permissions,
          tenantId,
        );
      }
      console.log(
        `  rol creado: ${nombre}` +
          (eq.plantilla !== clave ? ` (plantilla ${plantilla.key})` : ''),
      );
    } else {
      console.log(`  rol ya existía: ${nombre}`);
    }
    rolesPorClave.set(clave, rol);
  }
  if (sinEquivalencia.length) {
    console.log(
      `  aviso: sin equivalencia y por lo tanto no creados: ${sinEquivalencia.join(', ')}`,
    );
  }

  // ── 2. Bodegas: se cruzan por nombre, que es lo único que publica demachine
  const bodegas = await whRepo.find({ where: { tenantId } });
  const bodegaPorNombre = new Map(bodegas.map((w) => [normalizar(w.name), w]));
  const nombradasEnDemachine = new Set(
    payload.usuario_bodega.map((x) => normalizar(x.bodega)),
  );
  const soloEnMiPinta = bodegas.filter(
    (w) => !nombradasEnDemachine.has(normalizar(w.name)),
  );
  if (soloEnMiPinta.length) {
    console.log(
      `\n  AVISO: estas bodegas existen en MiPinta y demachine nunca las nombra, ` +
        `así que nadie va a quedar habilitado en ellas:\n    ` +
        soloEnMiPinta.map((w) => w.name).join(', ') +
        `\n  Si alguien trabaja ahí, asígnasela a mano después.`,
    );
  }

  // ── 3. Roles y bodegas de cada usuario, cruzados por nombre ─────────────
  const rolesDeUsuario = new Map<string, string[]>();
  for (const x of payload.usuario_rol) {
    const clave = normalizar(x.usuario);
    rolesDeUsuario.set(clave, [
      ...(rolesDeUsuario.get(clave) ?? []),
      normalizar(x.rol),
    ]);
  }
  const bodegasDeUsuario = new Map<string, string[]>();
  for (const x of payload.usuario_bodega) {
    const clave = normalizar(x.usuario);
    bodegasDeUsuario.set(clave, [
      ...(bodegasDeUsuario.get(clave) ?? []),
      normalizar(x.bodega),
    ]);
  }

  /**
   * El rol que representa una combinación de roles de demachine.
   *
   * Uno solo: se devuelve el que ya existe. Varios: se crea uno con la unión
   * de sus permisos —«Jefe de Bodega + Cajero»— y se reusa para todo el que
   * traiga esa misma combinación, que en una tienda son dos o tres.
   *
   * Con administrador de por medio no hay nada que combinar: esa plantilla ya
   * lo concede todo.
   */
  const combinados = new Map<string, AccessRole>();
  const rolCombinado = async (
    claves: string[],
  ): Promise<AccessRole | undefined> => {
    if (!claves.length) return undefined;
    if (claves.includes('administrador'))
      return rolesPorClave.get('administrador');
    if (claves.length === 1) return rolesPorClave.get(claves[0]);

    const firma = claves.join('|');
    const yaHecho = combinados.get(firma);
    if (yaHecho) return yaHecho;

    const nombre = claves
      .map((c) => rolesPorClave.get(c)?.name ?? c)
      .join(' + ');
    let rol = await roleRepo.findOne({ where: { tenantId, name: nombre } });
    if (!rol) {
      const matriz = unir(
        claves.map((c) => {
          const plantilla = findRoleTemplate(EQUIVALENCIAS[c].plantilla);
          if (!plantilla) throw new Error(`Falta la plantilla de ${c}`);
          return plantilla.permissions;
        }),
      );
      rol = roleRepo.create({
        name: nombre,
        description:
          `Combinación de los roles que esta persona tenía en el sistema ` +
          `anterior: ${nombre}. Puede lo de todos ellos juntos.`,
        templateKey: null,
        tenantId,
      });
      if (!DRY_RUN) {
        rol = await roleRepo.save(rol);
        await escribirPermisos(permRepo, rol.id, matriz, tenantId);
      }
      console.log(`  rol combinado creado: ${nombre}`);
    }
    combinados.set(firma, rol);
    return rol;
  };

  const stats = {
    creados: 0,
    actualizados: 0,
    rolAsignado: 0,
    bodegasAsignadas: 0,
    saltados: 0,
  };
  const nuevos: { usuario: string; email: string; clave: string }[] = [];
  const resumen: string[][] = [];

  for (const u of payload.usuarios) {
    const nombre = (u.nombre || '').trim();
    const claveNombre = normalizar(nombre);
    // `support` es la cuenta interna del proveedor de demachine, no de la
    // tienda: traerla sería crear un acceso que nadie va a usar ni a auditar.
    if (!nombre || claveNombre === 'support') {
      stats.saltados++;
      continue;
    }

    // Sin correo en demachine —pasa— se arma uno interno. No sirve para
    // recibir nada, pero el login real de esta gente es el nombre de usuario.
    const email =
      (u.email || '').trim().toLowerCase() ||
      `${aUsername(nombre) || `us${u.id}`}@${TENANT_SLUG}.local`;
    const username = aUsername(nombre) || `us${u.id}`;

    let user = await userRepo.findOne({ where: { tenantId, email } });
    if (!user) {
      user = await userRepo.findOne({ where: { tenantId, username } });
    }

    let claveNueva = '';
    if (!user) {
      claveNueva = claveTemporal();
      const partes = nombre.split(/\s+/);
      user = userRepo.create({
        email,
        username,
        passwordHash: await bcrypt.hash(claveNueva, 10),
        firstName: partes[0],
        lastName: partes.slice(1).join(' ') || tenant.name,
        role: Role.COLABORADOR,
        isActive: true,
        tenantId,
      });
      if (!DRY_RUN) user = await userRepo.save(user);
      stats.creados++;
      nuevos.push({ usuario: username, email, clave: claveNueva });
    } else if (!user.username) {
      // En demachine se entra por nombre. Sin `username`, esta gente tendría
      // que aprenderse un correo que quizá ni existe.
      user.username = username;
      if (!DRY_RUN) await userRepo.save(user);
      stats.actualizados++;
    }

    // Todos los roles que tenía en demachine, de mayor a menor alcance. Si allá
    // no tenía ninguno, se mira si el nombre de la cuenta lo dice.
    const declarados = rolesDeUsuario.get(claveNombre) ?? [];
    const supuestos = declarados.length
      ? []
      : (POR_NOMBRE_DE_CUENTA[claveNombre] ?? []);
    if (supuestos.length) {
      console.log(
        `  aviso: "${nombre}" no tenía rol en demachine; se le da ` +
          `${supuestos.join(' + ')} por el nombre de la cuenta.`,
      );
    }
    const suyos = [...new Set([...declarados, ...supuestos])]
      .filter((c) => !!EQUIVALENCIAS[c])
      .sort((a, b) => EQUIVALENCIAS[b].alcance - EQUIVALENCIAS[a].alcance);
    const esAdministrador = suyos.includes('administrador');
    const rolAcceso = await rolCombinado(suyos);

    if (rolAcceso && user.accessRoleId !== rolAcceso.id) {
      user.accessRoleId = rolAcceso.id;
      if (!DRY_RUN) await userRepo.save(user);
      stats.rolAsignado++;
    }

    // Bodegas. A un administrador no se le restringen: atarlo a un subconjunto
    // lo deja sin ver su propia tienda, y en demachine tampoco lo estaba.
    const nombresBodega = bodegasDeUsuario.get(claveNombre) ?? [];
    const encontradas = nombresBodega
      .map((n) => bodegaPorNombre.get(n))
      .filter((w): w is Warehouse => !!w);
    const perdidas = nombresBodega.filter((n) => !bodegaPorNombre.has(n));
    let textoBodegas: string;
    if (esAdministrador) {
      textoBodegas = 'todas (administrador)';
    } else if (encontradas.length) {
      if (!DRY_RUN) {
        await userWhRepo.delete({ userId: user.id });
        await userWhRepo.save(
          encontradas.map((w) =>
            userWhRepo.create({
              userId: user.id,
              warehouseId: w.id,
              tenantId,
            }),
          ),
        );
      }
      stats.bodegasAsignadas++;
      textoBodegas = encontradas.map((w) => w.name).join(', ');
    } else {
      textoBodegas = 'todas (demachine no le asignó ninguna)';
    }
    if (perdidas.length) {
      textoBodegas += ` [sin equivalencia: ${perdidas.join(', ')}]`;
    }

    resumen.push([
      username,
      email,
      rolAcceso?.name ?? '(sin rol: entra sin restricción)',
      textoBodegas,
      claveNueva ? 'NUEVO' : '',
    ]);
  }

  // ── Informe ─────────────────────────────────────────────────────────────
  const anchoRol = Math.max(20, ...resumen.map((f) => f[2].length));
  console.log(`\n  ${'usuario'.padEnd(17)} ${'rol'.padEnd(anchoRol)} bodegas`);
  console.log('  ' + '-'.repeat(24 + anchoRol + 30));
  for (const f of resumen) {
    console.log(
      `  ${f[0].padEnd(17)} ${f[2].padEnd(anchoRol)} ${f[3]}${f[4] ? '  ← ' + f[4] : ''}`,
    );
  }

  console.log(
    `\n  creados=${stats.creados} usernames=${stats.actualizados} ` +
      `roles=${stats.rolAsignado} bodegas=${stats.bodegasAsignadas} saltados=${stats.saltados}`,
  );

  // Quien no trae rol sigue entrando sin límites: es exactamente el estado que
  // este importador viene a corregir, así que no puede pasar en silencio.
  const sinRol = resumen.filter((f) => f[2].startsWith('(sin rol'));
  if (sinRol.length) {
    console.log(
      `\n  ATENCIÓN: ${sinRol.length} usuario(s) siguen SIN restricción porque ` +
        `demachine no les tenía ningún rol asignado:\n    ` +
        sinRol.map((f) => `${f[0]} (${f[1]})`).join('\n    ') +
        `\n  Hoy pueden hacer todo. Asígnales un rol desde Usuarios > Permisos, ` +
        `o desactívalos si ya nadie los usa.`,
    );
  }

  if (nuevos.length) {
    console.log('\n  Contraseñas temporales de las cuentas nuevas:');
    for (const n of nuevos) {
      console.log(`    ${n.usuario.padEnd(16)} ${n.clave}   (${n.email})`);
    }
    console.log(
      '  Entrégalas por un canal privado y que las cambien al entrar.',
    );
  }

  if (DRY_RUN) {
    console.log('\n  Fue una simulación: no se escribió nada.');
  }

  await ds.destroy();
}

/**
 * La unión de varias matrices: se concede lo que conceda cualquiera de ellas.
 *
 * Es lo que significaba tener dos roles en demachine. Quitarle a alguien algo
 * que hacía ayer es peor que dejarle de más: lo primero lo descubre a las ocho
 * de la mañana con un cliente enfrente.
 */
function unir(matrices: ModulePermission[][]): ModulePermission[] {
  const porModulo = new Map<string, ModulePermission>();
  for (const matriz of matrices) {
    for (const p of matriz) {
      const previo = porModulo.get(p.module);
      porModulo.set(p.module, {
        module: p.module,
        list: !!previo?.list || p.list,
        create: !!previo?.create || p.create,
        edit: !!previo?.edit || p.edit,
        delete: !!previo?.delete || p.delete,
      });
    }
  }
  return [...porModulo.values()];
}

/**
 * Escribe la matriz de permisos de un rol recién creado.
 *
 * Una fila por módulo con sus cuatro banderas —igual que `AccessService`—, y
 * solo de los módulos que conceden algo: la ausencia de fila ya significa «no».
 */
async function escribirPermisos(
  repo: Repository<RolePermission>,
  roleId: string,
  permisos: ModulePermission[],
  tenantId: string,
) {
  const filas = permisos
    .filter((p) => MODULE_KEYS.includes(p.module))
    .filter((p) => p.list || p.create || p.edit || p.delete)
    .map((p) =>
      repo.create({
        roleId,
        module: p.module,
        canList: !!p.list,
        canCreate: !!p.create,
        canEdit: !!p.edit,
        canDelete: !!p.delete,
        tenantId,
      }),
    );
  if (filas.length) await repo.save(filas);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
