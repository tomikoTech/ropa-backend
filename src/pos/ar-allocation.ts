/**
 * Cómo se reparte un abono entre varias deudas.
 *
 * Un local debe diez pares de días distintos. Cobrarlos de a uno era lo que
 * había, y era lento: había que entrar día por día y registrar venta por
 * venta. Aquí se juntan y se cobra una sola vez.
 *
 * Vive aparte del servicio a propósito. Es aritmética de plata —la parte donde
 * un centavo mal puesto deja una deuda que nunca cierra— y así se puede probar
 * hasta el último caso raro sin levantar una base de datos.
 *
 * **Todo en centavos enteros.** Con decimales, tres abonos de un tercio dejan
 * un peso colgando: la cuenta queda en 0,01 para siempre y nadie entiende por
 * qué el cliente sigue debiendo.
 */

export interface CuentaPorCobrar {
  id: string;
  totalCents: number;
  paidCents: number;
}

export interface AplicacionDeAbono {
  cuentaId: string;
  centavos: number;
  quedaSaldada: boolean;
}

/**
 * Reparte `abonoCents` entre las cuentas, **en el orden en que vengan**.
 *
 * Quien llama decide el orden —de la más vieja a la más nueva es lo que espera
 * quien debe— y también valida que el abono no exceda lo pendiente: esta
 * función no inventa deuda para acomodar la plata, simplemente deja de
 * repartir cuando no queda a quién.
 */
export function repartirAbono(
  cuentas: CuentaPorCobrar[],
  abonoCents: number,
): AplicacionDeAbono[] {
  let porRepartir = Math.trunc(abonoCents);
  if (porRepartir <= 0) return [];

  const aplicaciones: AplicacionDeAbono[] = [];
  for (const cuenta of cuentas) {
    if (porRepartir <= 0) break;
    // Un dato torcido —más abonado que total— se ignora en vez de restar
    // plata: `Math.max` evita que una cuenta rara se coma el abono de las
    // demás en negativo.
    const pendiente = Math.max(0, cuenta.totalCents - cuenta.paidCents);
    if (pendiente === 0) continue;

    const aplicado = Math.min(porRepartir, pendiente);
    porRepartir -= aplicado;
    aplicaciones.push({
      cuentaId: cuenta.id,
      centavos: aplicado,
      // `>=` y no `===` a propósito: hoy `aplicado` viene acotado por
      // `pendiente`, así que nunca se pasa. Pero si mañana alguien cambia ese
      // recorte, con `===` la cuenta se quedaría abierta para siempre por un
      // centavo de más, que es el peor final posible para una deuda.
      quedaSaldada: cuenta.paidCents + aplicado >= cuenta.totalCents,
    });
  }
  return aplicaciones;
}

/** Lo que falta por cobrar de un grupo de cuentas, en centavos. */
export function pendienteTotal(cuentas: CuentaPorCobrar[]): number {
  return cuentas.reduce(
    (suma, cuenta) => suma + Math.max(0, cuenta.totalCents - cuenta.paidCents),
    0,
  );
}
