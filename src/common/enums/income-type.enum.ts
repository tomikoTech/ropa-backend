// Tipo de movimiento manual en el libro de ingresos/tesorería.
export enum IncomeType {
  INGRESO = 'INGRESO', // ingreso manual (no proviene de una venta)
  AJUSTE = 'AJUSTE', // sumar/restar saldo de un banco/método
  TRANSFERENCIA = 'TRANSFERENCIA', // mover plata entre banco/método
}

// Categoría del ingreso. Las ventas de productos son VENTAS (derivadas de los
// pagos); los ingresos manuales son OTROS.
export enum IncomeCategory {
  VENTAS = 'VENTAS',
  OTROS = 'OTROS',
}
