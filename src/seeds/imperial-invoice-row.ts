/**
 * Columnas de la hoja `Facturas` del archivo histórico de Imperial.
 *
 * Las correcciones que envía la clienta omiten la columna `10%`: el descuento
 * se deriva como Valor - Total con Descuento para no desplazar las columnas.
 */
export const IMPERIAL_FACTURAS_HEADERS = [
  'Fact',
  'Fecha',
  'Fechaactual',
  'Díascredito',
  'Nombre',
  'Valor',
  '10%',
  'Total con Descuento',
  'Abonos',
  'Saldo',
  '30 a 60',
  '61 a 90',
  'Más de 90',
  'Total Días',
  'Pendiente',
] as const;

export interface ImperialInvoiceRow {
  fact: string;
  fecha: string;
  vence: string;
  diasCredito: number;
  nombre: string;
  valor: number;
  descuento: number;
  total: number;
  abonos: number;
  saldo: number;
  bucket30a60: number;
  bucket61a90: number;
  bucketMas90: number;
  totalDias: number;
  pendiente: string;
}

const number = (value: string, column: string): number => {
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`${column} no es un número válido: ${value}`);
  }
  return parsed;
};

const isoDate = (value: string, column: string): string => {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) throw new Error(`${column} debe usar DD/MM/AAAA: ${value}`);
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getUTCFullYear() !== Number(year) ||
    parsed.getUTCMonth() + 1 !== Number(month) ||
    parsed.getUTCDate() !== Number(day)
  ) {
    throw new Error(`${column} no es una fecha válida: ${value}`);
  }
  return iso;
};

/** Mapea la fila compacta de 14 valores a las 15 columnas del Excel. */
export function parseImperialInvoiceCorrection(
  csv: string,
): ImperialInvoiceRow {
  const values = csv.split(',').map((value) => value.trim());
  if (values.length !== 14) {
    throw new Error(`Se esperaban 14 valores y llegaron ${values.length}`);
  }
  const [
    fact,
    fecha,
    vence,
    diasCredito,
    nombre,
    valor,
    total,
    abonos,
    saldo,
    bucket30a60,
    bucket61a90,
    bucketMas90,
    totalDias,
    pendiente,
  ] = values;
  const parsedValor = number(valor, 'Valor');
  const parsedTotal = number(total, 'Total con Descuento');
  const row: ImperialInvoiceRow = {
    fact,
    fecha: isoDate(fecha, 'Fecha'),
    vence: isoDate(vence, 'Fechaactual'),
    diasCredito: number(diasCredito, 'Díascredito'),
    nombre,
    valor: parsedValor,
    descuento: parsedValor - parsedTotal,
    total: parsedTotal,
    abonos: number(abonos, 'Abonos'),
    saldo: number(saldo, 'Saldo'),
    bucket30a60: number(bucket30a60, '30 a 60'),
    bucket61a90: number(bucket61a90, '61 a 90'),
    bucketMas90: number(bucketMas90, 'Más de 90'),
    totalDias: number(totalDias, 'Total Días'),
    pendiente: pendiente.toUpperCase(),
  };

  if (!/^\d+-\d+$/.test(row.fact)) {
    throw new Error(
      `Fact debe identificar el duplicado con sufijo: ${row.fact}`,
    );
  }
  if (row.valor - row.descuento !== row.total) {
    throw new Error('Valor, descuento y total no cuadran');
  }
  if (row.total - row.abonos !== row.saldo) {
    throw new Error('Total, abonos y saldo no cuadran');
  }
  if (row.pendiente !== 'DEBE' || row.saldo <= 0) {
    throw new Error('La fila esperada debe representar una deuda pendiente');
  }
  return row;
}

export const IMPERIAL_INVOICE_699_2 = parseImperialInvoiceCorrection(
  '699-2,24/07/2026,23/08/2026,30,Dalila Peñaloza,615000,615000,0,615000,0,0,0,-15,DEBE',
);
