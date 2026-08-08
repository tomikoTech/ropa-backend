import {
  resolveRange,
  normalizeParams,
  buildReportQuery,
  timestampRangeSql,
  dateRangeSql,
  localDaySql,
  money,
  int,
  marginPct,
} from './report-filters.js';

describe('resolveRange', () => {
  const now = new Date(2026, 7, 7); // 7 de agosto de 2026 (local)

  it('sin fechas usa el mes en curso', () => {
    expect(resolveRange(undefined, undefined, now)).toEqual({
      from: '2026-08-01',
      to: '2026-08-07',
      warnings: [],
    });
  });

  it('respeta el rango que le pasan', () => {
    const r = resolveRange('2026-01-01', '2026-03-31', now);
    expect(r.from).toBe('2026-01-01');
    expect(r.to).toBe('2026-03-31');
    expect(r.warnings).toEqual([]);
  });

  it('endereza un rango invertido y lo avisa', () => {
    const r = resolveRange('2026-03-31', '2026-01-01', now);
    expect([r.from, r.to]).toEqual(['2026-01-01', '2026-03-31']);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('intercambiaron');
  });

  it('descarta una fecha con formato inválido y lo avisa', () => {
    const r = resolveRange('ayer', '2026-08-05', now);
    expect(r.from).toBe('2026-08-01'); // cae al default
    expect(r.to).toBe('2026-08-05');
    expect(r.warnings[0]).toContain('inválida');
  });

  it('no acepta una fecha "casi" ISO', () => {
    // Sin esto, "2026-8-7" llegaría a Postgres y el reporte fallaría con un
    // error de casteo en vez de con un aviso legible.
    expect(resolveRange('2026-8-7', undefined, now).warnings).toHaveLength(1);
  });
});

describe('normalizeParams', () => {
  it('recorta, descarta vacíos y descarta ALL', () => {
    expect(
      normalizeParams({
        warehouseId: '  abc  ',
        categoryId: 'ALL',
        search: '',
        limit: 50,
        nulo: null,
        indefinido: undefined,
      }),
    ).toEqual({ warehouseId: 'abc', limit: '50' });
  });

  it('con el filtro repetido se queda con el último', () => {
    expect(normalizeParams({ mode: ['a', 'b'] })).toEqual({ mode: 'b' });
  });
});

describe('buildReportQuery', () => {
  const now = new Date(2026, 7, 7);

  it('flag reconoce las formas de "sí"', () => {
    const q = buildReportQuery({ a: 'true', b: '1', c: 'sí', d: 'false' }, now);
    expect([q.flag('a'), q.flag('b'), q.flag('c')]).toEqual([true, true, true]);
    expect(q.flag('d')).toBe(false);
    expect(q.flag('inexistente')).toBe(false);
  });

  it('pick solo acepta valores de la lista', () => {
    const allowed = ['variant', 'product'] as const;
    expect(
      buildReportQuery({ groupBy: 'product' }, now).pick(
        'groupBy',
        allowed,
        'variant',
      ),
    ).toBe('product');
    expect(
      buildReportQuery({ groupBy: 'otro' }, now).pick(
        'groupBy',
        allowed,
        'variant',
      ),
    ).toBe('variant');
    expect(buildReportQuery({}, now).pick('groupBy', allowed, 'variant')).toBe(
      'variant',
    );
  });

  it('uuid descarta un id que no es uuid en vez de mandarlo a Postgres', () => {
    // Un uuid inválido en un `= :id` de columna uuid revienta la consulta
    // (22P02). Aquí simplemente no filtra.
    const q = buildReportQuery(
      { ok: '3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607', malo: 'abc' },
      now,
    );
    expect(q.uuid('ok')).toBe('3f1a2b4c-5d6e-4f70-8a91-b2c3d4e5f607');
    expect(q.uuid('malo')).toBeUndefined();
  });

  it('text colapsa espacios internos', () => {
    expect(
      buildReportQuery({ search: '  nike   air  ' }, now).text('search'),
    ).toBe('nike air');
    expect(
      buildReportQuery({ search: '   ' }, now).text('search'),
    ).toBeUndefined();
  });

  it('arrastra los avisos del rango de fechas', () => {
    const q = buildReportQuery({ from: '2026-03-01', to: '2026-02-01' }, now);
    expect(q.warnings).toHaveLength(1);
  });
});

describe('SQL de fechas', () => {
  it('el límite superior es el día siguiente, exclusivo', () => {
    // Es la razón por la que "hasta hoy" ahora sí incluye lo de hoy.
    const sql = timestampRangeSql('s.created_at');
    expect(sql).toContain('>=');
    expect(sql).toContain('(:to)::date + 1');
    expect(sql).toContain('<');
    expect(sql).not.toContain('<=');
  });

  it('convierte a la zona del negocio, no a UTC', () => {
    expect(timestampRangeSql('s.created_at')).toContain('AT TIME ZONE');
    expect(localDaySql('s.created_at')).toContain('AT TIME ZONE');
  });

  it('una columna date se compara inclusive por los dos lados', () => {
    const sql = dateRangeSql('e.expense_date');
    expect(sql).toContain('>=');
    expect(sql).toContain('<=');
    expect(sql).not.toContain('AT TIME ZONE');
  });
});

describe('aritmética', () => {
  it('money redondea a dos decimales', () => {
    expect(money('1234.567')).toBe(1234.57);
    expect(money(0.1 + 0.2)).toBe(0.3);
  });

  it('money convierte lo que no es número en 0', () => {
    // Postgres devuelve null en un SUM sin filas; sin esto el total sale NaN
    // y el Excel muestra una celda de error.
    expect(money(null)).toBe(0);
    expect(money(undefined)).toBe(0);
    expect(money('abc')).toBe(0);
  });

  it('int trunca y tolera el texto de Postgres', () => {
    expect(int('42')).toBe(42);
    expect(int(7.9)).toBe(7);
    expect(int(null)).toBe(0);
  });

  it('marginPct devuelve 0 cuando no hubo venta', () => {
    expect(marginPct(500, 0)).toBe(0);
    expect(marginPct(2500, 10000)).toBe(25);
    expect(marginPct(-1000, 4000)).toBe(-25);
  });
});
