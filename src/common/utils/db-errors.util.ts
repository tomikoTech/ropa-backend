// Utilidades para tratar errores de PostgreSQL sin que se conviertan en un
// "Error interno del servidor" opaco para el usuario final.
//
// Dos usos:
//  1. `isUniqueViolation` / `retryOnUniqueViolation`: reintentar operaciones que
//     generan un identificador secuencial (número de venta, prefijo de SKU,
//     código de bodega...). Esos generadores leen el máximo/conteo actual y
//     luego insertan: entre la lectura y la inserción otro request puede tomar
//     el mismo valor, y datos históricos (registros borrados) pueden hacer que
//     el valor calculado ya exista. Reintentar recalcula y resuelve ambos.
//  2. `describePgError`: traducir el código SQLSTATE a un mensaje en español
//     para el filtro global de excepciones.

export interface PgError {
  code?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
  message?: string;
}

// TypeORM envuelve el error del driver, pero copia `code`/`detail`/`constraint`
// en la propia excepción (QueryFailedError), así que basta con leerlos.
export function asPgError(error: unknown): PgError | null {
  if (typeof error !== 'object' || error === null) return null;
  const e = error as PgError & { driverError?: PgError };
  const code = e.code ?? e.driverError?.code;
  if (typeof code !== 'string') return null;
  return {
    code,
    detail: e.detail ?? e.driverError?.detail,
    constraint: e.constraint ?? e.driverError?.constraint,
    table: e.table ?? e.driverError?.table,
    column: e.column ?? e.driverError?.column,
    message: e.message ?? e.driverError?.message,
  };
}

export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';
export const PG_NOT_NULL_VIOLATION = '23502';
export const PG_CHECK_VIOLATION = '23514';
export const PG_STRING_DATA_RIGHT_TRUNCATION = '22001';
export const PG_INVALID_TEXT_REPRESENTATION = '22P02';
export const PG_NUMERIC_VALUE_OUT_OF_RANGE = '22003';
export const PG_SERIALIZATION_FAILURE = '40001';
export const PG_DEADLOCK_DETECTED = '40P01';

export function isUniqueViolation(error: unknown): boolean {
  return asPgError(error)?.code === PG_UNIQUE_VIOLATION;
}

/**
 * Ejecuta `fn` y, si falla por violación de unicidad, la reintenta hasta
 * `attempts` veces. Pensada para envolver "calcular consecutivo + insertar":
 * cada reintento vuelve a calcular el consecutivo con el estado ya actualizado.
 * Si se agotan los intentos, relanza el error original.
 */
export async function retryOnUniqueViolation<T>(
  fn: () => Promise<T>,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

// Nombre legible del dato duplicado, deducido del nombre de la constraint o del
// `detail` de Postgres ("Key (tenant_id, sku_prefix)=(...) already exists.").
const FIELD_LABELS: Record<string, string> = {
  sku_prefix: 'código interno del producto (SKU)',
  sku: 'SKU',
  barcode: 'código de barras',
  slug: 'identificador web (slug)',
  name: 'nombre',
  email: 'correo electrónico',
  username: 'usuario',
  nit: 'NIT',
  code: 'código',
  document_number: 'número de documento',
  sale_number: 'número de venta',
  invoice_number: 'número de factura',
  order_number: 'número de orden',
  return_number: 'número de devolución',
  credit_note_number: 'número de nota crédito',
  store_slug: 'identificador de la tienda',
  custom_domain: 'dominio personalizado',
};

function duplicatedFieldLabel(err: PgError): string | null {
  const source = err.detail ?? err.constraint ?? '';
  const columns = source.match(/Key \(([^)]+)\)/)?.[1] ?? source;
  for (const [column, label] of Object.entries(FIELD_LABELS)) {
    if (columns.includes(column)) return label;
  }
  return null;
}

export interface PgErrorDescription {
  status: number;
  message: string;
}

/**
 * Traduce un error de PostgreSQL a status + mensaje en español. Devuelve null
 * si no es un error de base de datos reconocido (el llamador responde 500).
 */
export function describePgError(error: unknown): PgErrorDescription | null {
  const err = asPgError(error);
  if (!err?.code) return null;

  switch (err.code) {
    case PG_UNIQUE_VIOLATION: {
      const field = duplicatedFieldLabel(err);
      return {
        status: 409,
        message: field
          ? `Ya existe un registro con ese ${field}. Cambia el valor e intenta de nuevo.`
          : 'Ya existe un registro con esos datos. Revisa los campos únicos e intenta de nuevo.',
      };
    }
    case PG_FOREIGN_KEY_VIOLATION:
      return {
        status: 409,
        message:
          'La operación afecta datos relacionados: el registro referenciado no existe o está siendo usado por otros registros.',
      };
    case PG_NOT_NULL_VIOLATION:
      return {
        status: 400,
        message: err.column
          ? `Falta un dato obligatorio (${err.column}).`
          : 'Falta un dato obligatorio.',
      };
    case PG_CHECK_VIOLATION:
      return {
        status: 400,
        message: 'Alguno de los valores enviados no es válido.',
      };
    case PG_STRING_DATA_RIGHT_TRUNCATION:
      return {
        status: 400,
        message: 'Alguno de los textos enviados es demasiado largo.',
      };
    case PG_INVALID_TEXT_REPRESENTATION:
      return {
        status: 400,
        message:
          'Alguno de los datos enviados tiene un formato inválido (número o identificador mal formado).',
      };
    case PG_NUMERIC_VALUE_OUT_OF_RANGE:
      return {
        status: 400,
        message: 'Alguna de las cantidades o valores está fuera de rango.',
      };
    case PG_SERIALIZATION_FAILURE:
    case PG_DEADLOCK_DETECTED:
      return {
        status: 409,
        message:
          'Otra operación modificó los mismos datos al mismo tiempo. Intenta de nuevo.',
      };
    default:
      return null;
  }
}
