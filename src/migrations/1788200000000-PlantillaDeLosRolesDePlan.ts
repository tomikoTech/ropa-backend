import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los roles de plan se reconocen por su plantilla, no por su nombre.
 *
 * Un rol creado desde el plan «Revendedor (persona natural)» no se puede
 * editar ni borrar desde la tienda: sus permisos son lo que esa persona
 * contrato. Eso se decide mirando `template_key`.
 *
 * Los que ya estaban creados lo tienen en nulo —se hicieron antes de que el
 * seed lo guardara— y por tanto quedaban desprotegidos. Se rellena por nombre,
 * que es el unico dato que quedo para reconocerlos.
 */
export class PlantillaDeLosRolesDePlan1788200000000
  implements MigrationInterface
{
  name = 'PlantillaDeLosRolesDePlan1788200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "access_roles"
         SET "template_key" = 'revendedor'
       WHERE "template_key" IS NULL
         AND "name" = 'Revendedor (persona natural)'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "access_roles"
         SET "template_key" = NULL
       WHERE "template_key" = 'revendedor'
         AND "name" = 'Revendedor (persona natural)'
    `);
  }
}
