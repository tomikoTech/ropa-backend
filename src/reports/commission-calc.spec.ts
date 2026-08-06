// Unit test de la lógica de cálculo de comisión de puntas (F2), replicada del
// snapshot de PosService.createSale para verificarla de forma aislada.

function commissionAmount(
  mode: 'fixed' | 'percent',
  value: number,
  quantity: number,
  lineTotal: number,
): number {
  return mode === 'percent'
    ? Math.round(lineTotal * value) / 100
    : value * quantity;
}

// Criterio "esPunta" (sin acceso a BD): override manual gana; si no, edad + tallas.
function isLeftover(
  product: { isLeftover?: boolean | null },
  ageMonths: number,
  remainingSizes: number,
  cfg: { ageMonths: number; maxSizes: number },
): boolean {
  if (product.isLeftover !== null && product.isLeftover !== undefined) {
    return product.isLeftover;
  }
  if (ageMonths < cfg.ageMonths) return false;
  return remainingSizes <= cfg.maxSizes;
}

describe('commission calc (F2)', () => {
  it('monto fijo por par', () => {
    expect(commissionAmount('fixed', 3000, 2, 200000)).toBe(6000);
  });
  it('porcentaje del valor de la línea', () => {
    // 5% de 200000 = 10000
    expect(commissionAmount('percent', 5, 2, 200000)).toBe(10000);
  });
});

describe('isLeftover criterion (F2)', () => {
  const cfg = { ageMonths: 8, maxSizes: 2 };

  it('override manual true gana sobre el criterio', () => {
    expect(isLeftover({ isLeftover: true }, 1, 5, cfg)).toBe(true);
  });
  it('override manual false gana sobre el criterio', () => {
    expect(isLeftover({ isLeftover: false }, 24, 1, cfg)).toBe(false);
  });
  it('sin override: nuevo con pocas tallas NO es punta (edad < meses)', () => {
    expect(isLeftover({ isLeftover: null }, 2, 1, cfg)).toBe(false);
  });
  it('sin override: viejo con pocas tallas SÍ es punta', () => {
    expect(isLeftover({ isLeftover: null }, 10, 2, cfg)).toBe(true);
  });
  it('sin override: viejo con muchas tallas NO es punta', () => {
    expect(isLeftover({ isLeftover: null }, 10, 5, cfg)).toBe(false);
  });
});
