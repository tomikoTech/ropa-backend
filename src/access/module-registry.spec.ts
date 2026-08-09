import {
  MODULES,
  MODULE_KEYS,
  ACTIONS,
  moduleForPath,
  actionForRequest,
  resolvePermission,
  isUncheckedPath,
  UNCHECKED_ROUTES,
  ALWAYS_ALLOWED_ROUTES,
} from './module-registry.js';
import {
  ROLE_TEMPLATES,
  emptyMatrix,
  isEmptyMatrix,
  countGranted,
  findRoleTemplate,
} from './role-templates.js';

describe('catálogo de módulos', () => {
  it('no hay claves repetidas y todas tienen etiqueta y grupo', () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
    for (const m of MODULES) {
      expect(m.label).toBeTruthy();
      expect(m.group).toBeTruthy();
    }
  });

  it('todo módulo del catálogo es alcanzable desde alguna ruta', () => {
    // Un módulo que ninguna ruta usa es un permiso que no hace nada: aparece en
    // la matriz, alguien lo apaga esperando cerrar algo, y no cierra nada.
    const rutas = [
      'pos/sales',
      'pos/accounts-receivable',
      'products',
      'categories',
      'brands',
      'sizes',
      'promotions',
      'inventory',
      'inventory/warehouses',
      'inventory/transfers',
      'inventory-counts',
      'internal-requests',
      'street',
      'reservations',
      'production',
      'suppliers',
      'purchases',
      'purchases/accounts-payable',
      'incomes',
      'expenses',
      'banks',
      'vouchers',
      'clients',
      'returns',
      'reports',
      'consignments',
      'quotations',
      'store-settings',
      'store-settings/orders',
      'users',
      'access',
      'audit',
    ];
    const alcanzados = new Set(
      rutas.map((r) => moduleForPath(r)).filter(Boolean) as string[],
    );
    const huerfanos = MODULE_KEYS.filter((k) => !alcanzados.has(k));
    expect(huerfanos).toEqual([]);
  });
});

describe('ruta → módulo', () => {
  it('gana el prefijo más largo (el POS comparte controlador con Ventas)', () => {
    expect(moduleForPath('/api/pos/sales')).toBe('sales');
    expect(moduleForPath('/api/pos/sales/abc/cancel')).toBe('sales');
    expect(moduleForPath('/api/pos/accounts-receivable')).toBe(
      'accounts-receivable',
    );
    // El POS y el historial son el mismo módulo: "vender" es un solo permiso.
    expect(moduleForPath('/api/pos/scan/123')).toBe('sales');
    expect(moduleForPath('/api/pos')).toBe('sales');
  });

  it('la búsqueda del catálogo pertenece a Ventas, no a Productos', () => {
    // Es la que usa el POS para saber qué vender: si dependiera de Productos, un
    // cajero no podría vender. El costo lo quita el controlador.
    expect(moduleForPath('/api/products/search')).toBe('sales');
    expect(moduleForPath('/api/products/search/pos-catalog')).toBe('sales');
    expect(moduleForPath('/api/products')).toBe('products');
    expect(moduleForPath('/api/products/abc')).toBe('products');
  });

  it('las bodegas y los traslados no son el módulo de inventario', () => {
    expect(moduleForPath('/api/inventory/warehouses')).toBe('warehouses');
    expect(moduleForPath('/api/inventory/shelves/x')).toBe('warehouses');
    expect(moduleForPath('/api/inventory/transfers/x/receive')).toBe(
      'transfers',
    );
    expect(moduleForPath('/api/inventory/loans')).toBe('transfers');
    expect(moduleForPath('/api/inventory/adjust')).toBe('inventory');
    expect(moduleForPath('/api/inventory/stock')).toBe('inventory');
  });

  it('las solicitudes internas tienen permiso propio', () => {
    expect(moduleForPath('/api/internal-requests')).toBe('internal-requests');
    expect(moduleForPath('/api/internal-requests/x/prepare')).toBe(
      'internal-requests',
    );
  });

  it('los pedidos de la tienda online no son la configuración', () => {
    expect(moduleForPath('/api/store-settings/orders/x/status')).toBe(
      'web-sales',
    );
    expect(moduleForPath('/api/store-settings')).toBe('settings');
  });

  it('las tallas, colores y curvas comparten un solo permiso', () => {
    for (const p of ['sizes', 'colors', 'size-curves']) {
      expect(moduleForPath(`/api/${p}`)).toBe('catalogs');
    }
  });

  it('los bultos y las etiquetas cuentan como inventario', () => {
    expect(moduleForPath('/api/stock-units/by-barcode/1')).toBe('inventory');
    expect(moduleForPath('/api/labels/zpl')).toBe('inventory');
  });

  it('tolera el prefijo /api, las barras sobrantes y el querystring', () => {
    for (const p of [
      'products',
      '/products',
      '/api/products/',
      'api/products?x=1',
    ]) {
      expect(moduleForPath(p)).toBe('products');
    }
  });

  it('lo público y las utilidades quedan fuera de la matriz, a propósito', () => {
    for (const p of Object.keys(UNCHECKED_ROUTES)) {
      expect(moduleForPath(`/api/${p}/lo-que-sea`)).toBeNull();
      expect(isUncheckedPath(`/api/${p}/lo-que-sea`)).toBe(true);
    }
  });

  it('una ruta desconocida no revienta: devuelve null', () => {
    expect(moduleForPath('/api/modulo-que-no-existe')).toBeNull();
    expect(moduleForPath('')).toBeNull();
  });
});

describe('método → acción', () => {
  it('GET es ver y DELETE es borrar', () => {
    expect(actionForRequest('GET', 'products', 'products')).toBe('list');
    expect(actionForRequest('DELETE', 'products/1', 'products')).toBe('delete');
  });

  it('PATCH y PUT son editar', () => {
    expect(actionForRequest('PATCH', 'products/1', 'products')).toBe('edit');
    expect(actionForRequest('PUT', 'products/1', 'products')).toBe('edit');
  });

  it('POST sobre la colección es crear', () => {
    expect(actionForRequest('POST', 'products', 'products')).toBe('create');
    expect(actionForRequest('POST', 'pos/sales', 'sales')).toBe('create');
    expect(actionForRequest('POST', 'inventory/transfer', 'transfers')).toBe(
      'create',
    );
  });

  it('POST sobre algo que ya existe es editar, no crear', () => {
    // Si no, dar permiso de "Crear ventas" daría permiso para anularlas.
    expect(actionForRequest('POST', 'pos/sales/abc/cancel', 'sales')).toBe(
      'edit',
    );
    expect(actionForRequest('POST', 'pos/sales/abc/mark-paid', 'sales')).toBe(
      'edit',
    );
    expect(actionForRequest('POST', 'purchases/abc/receive', 'purchases')).toBe(
      'edit',
    );
    expect(actionForRequest('POST', 'inventory/adjust', 'inventory')).toBe(
      'edit',
    );
    expect(
      actionForRequest('POST', 'inventory/transfers/abc/receive', 'transfers'),
    ).toBe('edit');
    expect(
      actionForRequest(
        'POST',
        'pos/accounts-receivable/abc/payment',
        'accounts-receivable',
      ),
    ).toBe('edit');
    expect(
      resolvePermission(
        'POST',
        '/api/pos/accounts-receivable/clients/abc/balance-payment',
      ),
    ).toEqual({ module: 'accounts-receivable', action: 'edit' });
  });

  it('una ruta que no coincide con el mapa se resuelve por su forma', () => {
    // Robustez: si mañana aparece un endpoint por otro camino, un POST con
    // segmentos de más sigue contando como editar y no como crear.
    expect(actionForRequest('POST', 'lo/que/sea/x/accion', 'products')).toBe(
      'edit',
    );
    expect(actionForRequest('POST', 'raro', 'products')).toBe('create');
  });
});

describe('resolvePermission', () => {
  it('junta módulo y acción', () => {
    expect(resolvePermission('POST', '/api/pos/sales')).toEqual({
      module: 'sales',
      action: 'create',
    });
    expect(resolvePermission('DELETE', '/api/inventory/warehouses/1')).toEqual({
      module: 'warehouses',
      action: 'delete',
    });
  });

  it('las lecturas que necesita toda la interfaz no se controlan', () => {
    // Si estas se cerraran, un rol restringido no podría ni dibujar el menú.
    for (const key of Object.keys(ALWAYS_ALLOWED_ROUTES)) {
      const [method, path] = key.split(' ');
      expect(resolvePermission(method, `/api/${path}`)).toBeNull();
    }
    // Pero escribir la configuración sí se controla.
    expect(resolvePermission('PATCH', '/api/store-settings')).toEqual({
      module: 'settings',
      action: 'edit',
    });
    // Y el resto de reportes también.
    expect(resolvePermission('GET', '/api/reports/run/utilidad')).toEqual({
      module: 'reports',
      action: 'list',
    });
  });
});

describe('plantillas de rol', () => {
  it('están las seis del sistema anterior', () => {
    expect(ROLE_TEMPLATES.map((t) => t.name)).toEqual([
      'Administrador',
      'Gerente',
      'Cajero',
      'Jefe de Bodega',
      'Inventario',
      'Consulta',
    ]);
  });

  it('toda plantilla cubre todos los módulos y ninguno queda sin definir', () => {
    for (const t of ROLE_TEMPLATES) {
      expect(t.permissions.map((p) => p.module).sort()).toEqual(
        [...MODULE_KEYS].sort(),
      );
      expect(t.description).toBeTruthy();
    }
  });

  it('Administrador puede todo', () => {
    const admin = findRoleTemplate('administrador')!;
    for (const p of admin.permissions) {
      for (const a of ACTIONS) expect(p[a]).toBe(true);
    }
  });

  it('Consulta solo mira: cero permisos de escritura', () => {
    const consulta = findRoleTemplate('consulta')!;
    for (const p of consulta.permissions) {
      expect(p.create).toBe(false);
      expect(p.edit).toBe(false);
      expect(p.delete).toBe(false);
    }
    // Y no ve la administración de accesos ni de usuarios.
    expect(consulta.permissions.find((p) => p.module === 'access')!.list).toBe(
      false,
    );
    expect(consulta.permissions.find((p) => p.module === 'users')!.list).toBe(
      false,
    );
  });

  it('Cajero: no ve productos pero sí crea clientes (verificado en demachine)', () => {
    const cajero = findRoleTemplate('cajero')!;
    const m = (k: string) => cajero.permissions.find((p) => p.module === k)!;
    expect(m('products').list).toBe(false);
    expect(m('clients').create).toBe(true);
    // Vender es crear en Ventas; anular sería editar, y no lo tiene.
    expect(m('sales').create).toBe(true);
    expect(m('sales').edit).toBe(false);
    // Y necesita ver las bodegas: el POS pregunta en cuál se vende.
    expect(m('warehouses').list).toBe(true);
    // Cobra abonos pero no borra la cuenta.
    expect(m('accounts-receivable').edit).toBe(true);
    expect(m('accounts-receivable').delete).toBe(false);
    // No ve la plata de la tienda.
    expect(m('reports').list).toBe(false);
    expect(m('expenses').list).toBe(false);
  });

  it('Jefe de Bodega: manda en bodega pero no edita tallas ni marcas', () => {
    const jefe = findRoleTemplate('jefe-bodega')!;
    const m = (k: string) => jefe.permissions.find((p) => p.module === k)!;
    expect(m('inventory').edit).toBe(true);
    expect(m('transfers').create).toBe(true);
    expect(m('inventory-counts').create).toBe(true);
    expect(m('catalogs').list).toBe(true);
    expect(m('catalogs').edit).toBe(false);
    expect(m('brands').edit).toBe(false);
    expect(m('products').edit).toBe(false);
  });

  it('nadie fuera de Administrador puede editar los permisos', () => {
    // Quien pueda editar roles puede darse cualquier permiso: es la llave del
    // sistema y no debe venir encendida en ninguna otra plantilla.
    for (const t of ROLE_TEMPLATES) {
      if (t.key === 'administrador') continue;
      const access = t.permissions.find((p) => p.module === 'access')!;
      expect(access.edit).toBe(false);
      expect(access.create).toBe(false);
      expect(access.delete).toBe(false);
    }
  });

  it('el borrado se da con cuentagotas (en demachine casi nadie borra)', () => {
    for (const t of ROLE_TEMPLATES) {
      if (t.key === 'administrador') continue;
      const conBorrado = t.permissions
        .filter((p) => p.delete)
        .map((p) => p.module);
      // Solo lo corriente del día, nunca clientes, productos ni ventas.
      expect(conBorrado).not.toContain('clients');
      expect(conBorrado).not.toContain('products');
      expect(conBorrado).not.toContain('sales');
      expect(conBorrado).not.toContain('users');
    }
  });
});

describe('utilidades de la matriz', () => {
  it('la matriz vacía no concede nada', () => {
    const vacia = emptyMatrix();
    expect(vacia).toHaveLength(MODULE_KEYS.length);
    expect(isEmptyMatrix(vacia)).toBe(true);
    expect(countGranted(vacia)).toBe(0);
  });

  it('detecta que una plantilla no está vacía y cuenta lo concedido', () => {
    const admin = findRoleTemplate('administrador')!;
    expect(isEmptyMatrix(admin.permissions)).toBe(false);
    expect(countGranted(admin.permissions)).toBe(MODULE_KEYS.length * 4);
  });
});
