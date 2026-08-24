import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * La pantalla simplificada pasa a ser un permiso propio.
 *
 * Antes se **deducía**: «puede crear cotizaciones, no puede editarlas, no
 * puede cerrar ventas». Servía para un solo perfil. En cuanto se quiso un
 * segundo vendedor —el que sí cobra— la deducción se caía sola: darle permiso
 * de cobrar le devolvía el sistema entero, que es justo al revés de lo pedido.
 *
 * Los roles que ya existen no tienen la fila del módulo nuevo, así que se
 * rellena con la misma regla que se venía deduciendo. Sin esto, el vendedor
 * externo que ya está creado pierde su pantalla en el próximo despliegue.
 */
export class PantallaDeVentas1787800000000 implements MigrationInterface {
  name = 'PantallaDeVentas1787800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO "role_permissions"
        ("tenant_id", "role_id", "module", "can_list", "can_create", "can_edit", "can_delete")
      SELECT q."tenant_id", q."role_id", 'vender', true, false, false, false
        FROM "role_permissions" q
        JOIN "role_permissions" s
          ON s."role_id" = q."role_id" AND s."module" = 'sales'
       WHERE q."module" = 'quotations'
         AND q."can_create" = true
         AND q."can_edit" = false
         AND s."can_create" = false
         AND NOT EXISTS (
           SELECT 1 FROM "role_permissions" v
            WHERE v."role_id" = q."role_id" AND v."module" = 'vender'
         )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "role_permissions" WHERE "module" = 'vender'`,
    );
  }
}
