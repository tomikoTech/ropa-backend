/**
 * Catálogo de módulos y traducción de una petición HTTP a (módulo, acción).
 *
 * El sistema anterior define permisos **Listar / Adicionar / Editar / Borrar**
 * para cada par (módulo, rol). Se replica esa granularidad porque es la que el
 * cliente ya sabe usar, con una diferencia de fondo: **aquí se valida en el
 * servidor**. En demachine varias reglas viven solo en el JavaScript, y por eso
 * llamando la API directamente se aceptó un abono de $5.000 sobre una venta de
 * $1.000.
 *
 * La otra diferencia: en vez de anotar cuarenta controladores a mano, el módulo
 * y la acción **se deducen de la ruta y del verbo**. Un endpoint nuevo queda
 * protegido solo, sin que nadie tenga que acordarse de ponerle el decorador.
 * El test `module-registry.spec.ts` recorre las rutas reales y falla si alguna
 * no está cubierta, así que "no encontré el módulo" no puede ser un hueco
 * silencioso.
 *
 * Todo este archivo es **puro**: entra un método y una ruta, sale un módulo y
 * una acción.
 */

/** Las cuatro acciones del sistema anterior, con su nombre de allá. */
export const ACTIONS = ['list', 'create', 'edit', 'delete'] as const;
export type PermissionAction = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<PermissionAction, string> = {
  list: 'Ver',
  create: 'Crear',
  edit: 'Editar',
  delete: 'Borrar',
};

export interface ModuleDef {
  key: string;
  label: string;
  /** Agrupador para la matriz en pantalla. */
  group: string;
  /** Qué hace, en una línea, para que elegir permisos no sea adivinar. */
  hint?: string;
}

/**
 * Módulos de MiPinta. Las claves coinciden con las del menú (`nav-items.ts`)
 * para que el permiso y lo que se ve en pantalla hablen el mismo idioma.
 */
export const MODULES: ModuleDef[] = [
  // ── Ventas ────────────────────────────────────────────────────────────────
  {
    // El POS y el historial son el mismo módulo a propósito: dos permisos para
    // "vender" (uno para la pantalla y otro para la venta) es justo la clase de
    // ambigüedad que hace que alguien crea que dio un permiso y no lo dio.
    key: 'sales',
    label: 'Ventas y punto de venta',
    group: 'Ventas',
    hint:
      '"Ver" incluye buscar productos para vender · "Crear" es cerrar una venta · ' +
      '"Editar" es anular, corregir y marcar como pagada',
  },
  { key: 'web-sales', label: 'Ventas web', group: 'Ventas' },
  { key: 'consignments', label: 'Ventas de terceros', group: 'Ventas' },
  { key: 'quotations', label: 'Cotizaciones', group: 'Ventas' },
  {
    key: 'accounts-receivable',
    label: 'Cuentas por cobrar',
    group: 'Ventas',
    hint: '"Editar" es poder registrar abonos',
  },
  { key: 'returns', label: 'Devoluciones', group: 'Ventas' },

  // ── Catálogo ──────────────────────────────────────────────────────────────
  { key: 'products', label: 'Productos', group: 'Catálogo' },
  { key: 'categories', label: 'Categorías', group: 'Catálogo' },
  { key: 'brands', label: 'Marcas', group: 'Catálogo' },
  {
    key: 'catalogs',
    label: 'Tallas, colores y curvas',
    group: 'Catálogo',
    hint: 'Renombrar una talla afecta a todas las variantes que la usan',
  },
  { key: 'promotions', label: 'Promociones', group: 'Catálogo' },

  // ── Inventario ────────────────────────────────────────────────────────────
  {
    key: 'inventory',
    label: 'Inventario',
    group: 'Inventario',
    hint: '"Editar" incluye ajustar existencias y dar de baja',
  },
  {
    key: 'warehouses',
    label: 'Bodegas y ubicaciones',
    group: 'Inventario',
    hint: 'Bodegas, estanterías y stands',
  },
  { key: 'transfers', label: 'Traslados y préstamos', group: 'Inventario' },
  {
    key: 'street',
    label: 'Patinadores y remisión rápida',
    group: 'Inventario',
    hint:
      'Entregar mercancía para vender en la calle. "Editar" es cuadrar lo que ' +
      'volvió (y genera la venta)',
  },
  { key: 'inventory-counts', label: 'Conteos físicos', group: 'Inventario' },
  {
    key: 'internal-requests',
    label: 'Solicitudes internas',
    group: 'Inventario',
  },
  { key: 'reservations', label: 'Apartados', group: 'Inventario' },
  { key: 'production', label: 'Producción', group: 'Inventario' },

  // ── Compras ───────────────────────────────────────────────────────────────
  { key: 'suppliers', label: 'Proveedores', group: 'Compras' },
  {
    key: 'purchases',
    label: 'Compras',
    group: 'Compras',
    hint: '"Editar" incluye recibir mercancía',
  },
  {
    key: 'accounts-payable',
    label: 'Cuentas por pagar',
    group: 'Compras',
    hint: '"Editar" es poder registrar pagos a proveedores',
  },

  // ── Finanzas ──────────────────────────────────────────────────────────────
  { key: 'incomes', label: 'Ingresos', group: 'Finanzas' },
  { key: 'expenses', label: 'Egresos y caja menor', group: 'Finanzas' },
  { key: 'banks', label: 'Bancos', group: 'Finanzas' },
  { key: 'vouchers', label: 'Bonos y cupones', group: 'Finanzas' },

  // ── Gestión ───────────────────────────────────────────────────────────────
  { key: 'clients', label: 'Clientes', group: 'Gestión' },
  {
    key: 'reports',
    label: 'Reportes',
    group: 'Gestión',
    hint: 'Incluye costos, utilidad y cartera',
  },

  // ── Configuración ─────────────────────────────────────────────────────────
  {
    key: 'settings',
    label: 'Configuración de la tienda',
    group: 'Configuración',
  },
  { key: 'users', label: 'Usuarios', group: 'Configuración' },
  {
    key: 'access',
    label: 'Roles y permisos',
    group: 'Configuración',
    hint: 'Quien pueda editar esto puede darse cualquier permiso',
  },
  { key: 'audit', label: 'Auditoría', group: 'Configuración' },
];

export const MODULE_KEYS = MODULES.map((m) => m.key);

/**
 * Prefijo de ruta → módulo. **Gana el prefijo más largo**, que es lo que
 * permite que `/pos/sales` sea el módulo de Ventas y `/pos` el de vender,
 * aunque compartan controlador.
 */
const ROUTE_MODULES: Record<string, string> = {
  // POS: el controlador es uno, los módulos son varios.
  // `pos/sales` sigue listado aparte de `pos` aunque apunten al mismo módulo:
  // es lo que hace que `POST /pos/sales` cuente como CREAR (cerrar una venta) y
  // `POST /pos/sales/:id/cancel` como EDITAR.
  'pos/sales': 'sales',
  'pos/accounts-receivable': 'accounts-receivable',
  'pos/clients': 'clients',
  pos: 'sales',
  promoters: 'sales',

  // La búsqueda del catálogo es la que usa el POS para saber qué vender, así
  // que pertenece a Ventas y no a Productos: un cajero tiene que poder
  // encontrar la mercancía sin que eso le abra la administración del catálogo
  // (ni los costos: el controlador los quita si no tiene permiso de Productos).
  'products/search': 'sales',

  // Compras.
  'purchases/accounts-payable': 'accounts-payable',
  'purchases/suppliers': 'suppliers',
  purchases: 'purchases',
  suppliers: 'suppliers',

  // Inventario: ubicaciones y traslados tienen su propio permiso.
  'inventory/warehouses': 'warehouses',
  'inventory/shelves': 'warehouses',
  'inventory/stands': 'warehouses',
  'inventory/transfer': 'transfers',
  'inventory/transfers': 'transfers',
  'inventory/loans': 'transfers',
  inventory: 'inventory',
  'inventory-counts': 'inventory-counts',
  'internal-requests': 'internal-requests',
  street: 'street',
  'stock-units': 'inventory',
  labels: 'inventory',

  // Catálogo.
  products: 'products',
  categories: 'categories',
  brands: 'brands',
  sizes: 'catalogs',
  colors: 'catalogs',
  'size-curves': 'catalogs',
  promotions: 'promotions',

  // Resto.
  clients: 'clients',
  returns: 'returns',
  reports: 'reports',
  quotations: 'quotations',
  consignments: 'consignments',
  reservations: 'reservations',
  production: 'production',
  incomes: 'incomes',
  expenses: 'expenses',
  banks: 'banks',
  vouchers: 'vouchers',
  users: 'users',
  audit: 'audit',
  access: 'access',
  // Los pedidos de la tienda online cuelgan de la configuración.
  'store-settings/orders': 'web-sales',
  'store-settings': 'settings',
};

/**
 * Rutas que **no** pasan por la matriz, con el motivo.
 *
 * Son públicas, de autenticación o utilidades que se usan desde media docena de
 * pantallas: cerrarlas por módulo rompería funciones sin ganar seguridad real
 * (el dato sensible ya está protegido en la pantalla que lo usa).
 */
const UNCHECKED_PREFIXES: Record<string, string> = {
  auth: 'Login y refresh de sesión',
  storefront: 'Tienda pública y cuenta del cliente final',
  payments: 'Webhooks de la pasarela de pagos',
  admin: 'Endpoints de servicio con su propio token',
  tenants: 'Solo SUPER_ADMIN, que no pasa por la matriz',
  uploads: 'Subida de imágenes; se usa desde productos, tienda y comprobantes',
};

export const UNCHECKED_ROUTES = UNCHECKED_PREFIXES;

/**
 * Lecturas puntuales que **cualquier** usuario autenticado necesita para que la
 * aplicación siquiera se dibuje, con el motivo.
 *
 * Son la diferencia entre "este rol no ve Productos" y "este rol no puede
 * entrar". Todas son de lectura y ninguna expone algo que el usuario no viera
 * antes de que existieran los permisos.
 */
const ALWAYS_ALLOWED: Record<string, string> = {
  // Nombre de la tienda, módulos activos, tema: lo consume el menú entero.
  'GET store-settings': 'Configuración que necesita toda la interfaz',
  // Tarjetas del inicio; las ve cualquier usuario desde antes de los permisos.
  'GET reports/dashboard': 'Resumen del inicio',
  // Un usuario tiene derecho a saber qué puede hacer.
  'GET access/me': 'Permisos del propio usuario',
  // Encontrar una referencia no es un módulo: es lo primero que hace quien
  // vende, quien recibe una compra, quien traslada entre bodegas y quien
  // revisa el historial de un producto. Atarlo a Ventas dejaba a un
  // bodeguero sin poder buscar en su propia pantalla de Inventario. Es una
  // lectura del catálogo —nombre, foto y existencias, sin costos— y lo que
  // se haga después sí pasa por la matriz.
  'GET products/search/pos-catalog': 'Buscador de productos compartido',
};

export const ALWAYS_ALLOWED_ROUTES = ALWAYS_ALLOWED;

/** Quita el prefijo global de la API y los parámetros de consulta. */
function normalizePath(path: string): string {
  return path
    .split('?')[0]
    .replace(/^\/+/, '')
    .replace(/^api\/+/, '')
    .replace(/\/+$/, '');
}

/**
 * Módulo al que pertenece una ruta, o `null` si no se controla por permisos.
 *
 * Se prueban los prefijos de más largo a más corto (tres segmentos, dos, uno).
 */
export function moduleForPath(path: string): string | null {
  const clean = normalizePath(path);
  if (!clean) return null;
  const parts = clean.split('/');

  for (let depth = Math.min(parts.length, 3); depth >= 1; depth -= 1) {
    const prefix = parts.slice(0, depth).join('/');
    if (ROUTE_MODULES[prefix]) return ROUTE_MODULES[prefix];
    if (depth === 1 && UNCHECKED_PREFIXES[prefix]) return null;
  }
  return null;
}

/** ¿Esta ruta está fuera de la matriz a propósito? */
export function isUncheckedPath(path: string): boolean {
  const first = normalizePath(path).split('/')[0];
  return !!UNCHECKED_PREFIXES[first];
}

/**
 * Acción que representa una petición.
 *
 * La regla es la que usa cualquiera que administre una tienda:
 * - `GET` es **ver** (el listado y el detalle son lo mismo para estos efectos).
 * - `DELETE` es **borrar**.
 * - `PATCH`/`PUT` son **editar**.
 * - `POST` es **crear** solo cuando apunta a la colección (`POST /products`).
 *   Un `POST` sobre algo que ya existe (`/purchases/:id/receive`,
 *   `/pos/sales/:id/cancel`, `/inventory/adjust`) es **editar**: no nace un
 *   registro nuevo, se modifica uno que ya estaba.
 *
 * Sin esta última parte, "Crear" acabaría dando permiso para anular ventas.
 */
export function actionForRequest(
  method: string,
  path: string,
  module: string,
): PermissionAction {
  const verb = method.toUpperCase();
  if (verb === 'GET' || verb === 'HEAD' || verb === 'OPTIONS') return 'list';
  if (verb === 'DELETE') return 'delete';
  if (verb === 'PATCH' || verb === 'PUT') return 'edit';

  // POST: ¿colección o algo que ya existe?
  const clean = normalizePath(path);
  const moduleRoute = Object.entries(ROUTE_MODULES)
    .filter(([prefix, key]) => key === module && clean.startsWith(prefix))
    .map(([prefix]) => prefix)
    .sort((a, b) => b.length - a.length)[0];

  // Si la ruta no coincide con ningún prefijo conocido del módulo (un endpoint
  // nuevo, o el módulo llegó por otro camino), se decide por la forma de la
  // ruta: con segmentos de más, es una acción sobre algo que ya existe.
  if (!moduleRoute) return clean.split('/').length > 1 ? 'edit' : 'create';

  const rest = clean.slice(moduleRoute.length).replace(/^\/+/, '');
  return rest ? 'edit' : 'create';
}

export interface ResolvedPermission {
  module: string;
  action: PermissionAction;
}

/** Traduce la petición completa; `null` = no se controla por permisos. */
export function resolvePermission(
  method: string,
  path: string,
): ResolvedPermission | null {
  const clean = normalizePath(path);
  if (ALWAYS_ALLOWED[`${method.toUpperCase()} ${clean}`]) return null;

  const module = moduleForPath(path);
  if (!module) return null;
  return { module, action: actionForRequest(method, path, module) };
}
