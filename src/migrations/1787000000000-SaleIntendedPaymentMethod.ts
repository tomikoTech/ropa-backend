import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La venta pendiente recuerda con qué se iba a pagar.
 *
 * Lo reportó una tienda: cobraron por transferencia desde el POS, la factura
 * salió «Sin pagar», y al pulsar «Marcar como pagada» el sistema volvió a
 * preguntar si era efectivo, tarjeta o transferencia. La respuesta ya la
 * habían dado al vender: el método elegido se descartaba porque una venta
 * pendiente no crea fila en `payments`, y `payments` era el único lugar donde
 * vivía el método.
 *
 * `intended_payment_method` guarda lo acordado sin registrar plata: la fila de
 * `payments` —la que suma al banco y a los reportes— se sigue creando solo
 * cuando alguien confirma el pago.
 */
export class SaleIntendedPaymentMethod1787000000000
  implements MigrationInterface
{
  name = 'SaleIntendedPaymentMethod1787000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "intended_payment_method" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "sales" DROP COLUMN IF EXISTS "intended_payment_method"`,
    );
  }
}
