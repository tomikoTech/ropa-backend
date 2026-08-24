/**
 * Plantillas de rol: los seis roles del sistema anterior, ya traducidos a la
 * matriz de MiPinta.
 *
 * Por qué plantillas y no roles fijos: demachine tiene una fila por (módulo,
 * rol) y termina con **cientos de filas** que hay que revisar a mano. Aquí se
 * elige una plantilla, se ve la matriz completa y se ajusta lo que haga falta.
 * El cliente reconoce los nombres ("Cajero", "Jefe de Bodega") y no tiene que
 * armar sus permisos desde cero.
 *
 * Los detalles vienen del levantamiento en AMAWAD, no de una suposición: el
 * Cajero **no ve productos** pero **sí puede crear clientes**, y el Jefe de
 * Bodega **no edita tallas, colores ni marcas**. Y una corrección de fondo:
 * allá casi ningún rol puede borrar (el patrón es *Inactivar*), así que aquí
 * el permiso de borrar se da con cuentagotas.
 *
 * Archivo **puro**: no toca base de datos.
 */

import {
  ACTIONS,
  MODULE_KEYS,
  type PermissionAction,
} from './module-registry.js';

/** Los cuatro permisos de un módulo. */
export interface ModulePermission {
  module: string;
  list: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
}

export interface RoleTemplate {
  key: string;
  name: string;
  /** Para qué sirve, en el lenguaje del negocio. */
  description: string;
  permissions: ModulePermission[];
}

/** Abreviaturas para escribir las plantillas sin ruido. */
const NONE = '';
const R = 'r'; // ver
const RC = 'rc'; // ver + crear
const RE = 're'; // ver + editar
const RCE = 'rce'; // ver + crear + editar
const ALL = 'rced'; // todo, incluido borrar

/**
 * Receta de permisos: las letras de las acciones concedidas (`r` ver, `c` crear,
 * `e` editar, `d` borrar). Cadena vacía = ninguna.
 */
type Recipe = string;

function fromRecipe(module: string, recipe: Recipe): ModulePermission {
  return {
    module,
    list: recipe.includes('r'),
    create: recipe.includes('c'),
    edit: recipe.includes('e'),
    delete: recipe.includes('d'),
  };
}

/**
 * Arma la lista completa de módulos a partir de las excepciones.
 * Lo que no se menciona toma el valor por defecto: así una plantilla se lee de
 * un vistazo y agregar un módulo nuevo no deja plantillas a medio llenar.
 */
function build(
  defaultRecipe: Recipe,
  overrides: Record<string, Recipe>,
): ModulePermission[] {
  return MODULE_KEYS.map((module) =>
    fromRecipe(module, overrides[module] ?? defaultRecipe),
  );
}

export const ROLE_TEMPLATES: RoleTemplate[] = [
  {
    key: 'administrador',
    name: 'Administrador',
    description:
      'Todo, incluidos usuarios, permisos y borrado. Para el dueño o quien maneje la tienda.',
    permissions: build(ALL, {}),
  },
  {
    key: 'gerente',
    name: 'Gerente',
    description:
      'Ve y opera todo, con los números completos (costos, utilidad, cartera), ' +
      'pero no borra ni administra usuarios y permisos.',
    permissions: build(RCE, {
      users: R,
      access: NONE,
      audit: R,
      settings: R,
      // Borrar sí en lo que es corriente del día: un cupón mal emitido, un
      // gasto mal digitado. Es donde el sistema anterior también lo permite.
      vouchers: ALL,
      expenses: ALL,
      promotions: ALL,
    }),
  },
  {
    key: 'cajero',
    name: 'Cajero',
    description:
      'Vende y cobra. No ve productos ni costos, pero sí puede crear un cliente ' +
      'en el momento de la venta.',
    permissions: build(NONE, {
      // Ver (buscar qué vender) + crear (cerrar la venta). No editar: anular una
      // venta no es cosa del cajero.
      sales: RC,
      // Verificado en el sistema anterior: el cajero NO ve el módulo de
      // productos (ni sus costos), pero SÍ puede adicionar clientes.
      clients: RC,
      returns: RC,
      'accounts-receivable': RE,
      quotations: RC,
      vouchers: R,
      reservations: RC,
      // Ve el inventario para saber si hay, pero no lo toca.
      inventory: R,
      'internal-requests': RCE,
      // Necesita la lista de bodegas: el POS pide en cuál se está vendiendo.
      warehouses: R,
      // Ve lo que hay en la calle, pero despachar no es cosa del cajero.
      street: R,
    }),
  },
  {
    key: 'vendedor-externo',
    name: 'Vendedor externo',
    description:
      'Vende de las bodegas que se le asignen, pero **no cierra la venta**: la ' +
      'deja esperando autorización. No ve costos, ni compras, ni la plata de ' +
      'la tienda. Pensado para quien vende mercancía de un local sin tener ' +
      'inventario propio.',
    permissions: build(NONE, {
      // Crear la venta pendiente, y ver las suyas. **Sin `edit`**, que es lo
      // que exige autorizarla: quien vende no se aprueba a sí mismo, y esa
      // separación es todo el sentido de este perfil.
      // **Ver** ventas, no crearlas: el buscador de productos del punto de
      // venta vive en este módulo. Con `create` podría cerrar una venta
      // directo y saltarse la autorización, que es justo lo que no puede.
      sales: R,
      quotations: RC,
      // Ve qué hay para vender, no lo mueve. El costo lo borra el
      // interceptor de visibilidad al no tener el módulo de productos.
      inventory: R,
      // El punto de venta pregunta de qué bodega sale; solo verá las suyas,
      // que las limita el alcance por bodega del usuario.
      warehouses: R,
      // Para poder decir a quién le vendió.
      clients: RC,
    }),
  },
  {
    key: 'jefe-bodega',
    name: 'Jefe de Bodega',
    description:
      'Manda en la bodega: recibe mercancía, traslada, cuenta y ajusta. ' +
      'Ve el catálogo pero no lo modifica.',
    permissions: build(NONE, {
      inventory: RCE,
      warehouses: RCE,
      transfers: RCE,
      'inventory-counts': RCE,
      'internal-requests': RCE,
      // Es quien entrega la mercancía a los patinadores y quien la recibe de
      // vuelta.
      street: RCE,
      purchases: RE,
      suppliers: R,
      production: RCE,
      reservations: R,
      // Verificado: el jefe de bodega NO edita tallas, colores ni marcas.
      products: R,
      categories: R,
      brands: R,
      catalogs: R,
      sales: R,
    }),
  },
  {
    key: 'inventario',
    name: 'Inventario',
    description:
      'Solo para contar y mover mercancía. No ve ventas, ni plata, ni el catálogo completo.',
    permissions: build(NONE, {
      inventory: RE,
      'inventory-counts': RCE,
      'internal-requests': RCE,
      transfers: RCE,
      warehouses: R,
      products: R,
    }),
  },
  {
    key: 'consulta',
    name: 'Consulta',
    description:
      'Solo mira. Útil para el contador o para alguien que necesita revisar sin poder tocar nada.',
    permissions: build(R, {
      // Ni siquiera ve la administración de accesos.
      access: NONE,
      users: NONE,
    }),
  },
];

export function findRoleTemplate(key: string): RoleTemplate | undefined {
  return ROLE_TEMPLATES.find((t) => t.key === key);
}

/** Matriz vacía (todo apagado), punto de partida de un rol desde cero. */
export function emptyMatrix(): ModulePermission[] {
  return build(NONE, {});
}

/** ¿El rol puede hacer algo, o quedó en blanco? Un rol así no puede entrar. */
export function isEmptyMatrix(permissions: ModulePermission[]): boolean {
  return !permissions.some((p) => ACTIONS.some((a) => p[a]));
}

/**
 * Cuenta cuántos permisos tiene concedidos, para mostrarlo en la lista de roles
 * sin obligar a abrir la matriz.
 */
export function countGranted(permissions: ModulePermission[]): number {
  return permissions.reduce(
    (total, p) => total + ACTIONS.filter((a: PermissionAction) => p[a]).length,
    0,
  );
}
