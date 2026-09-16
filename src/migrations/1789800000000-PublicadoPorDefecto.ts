import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Un producto nuevo nace publicado.
 *
 * Con el catálogo público, «publicar» dejó de ser un paso aparte: lo que se
 * crea en la tienda es lo que se vende, y lo que no se quiera mostrar se
 * despublica. Antes nacía escondido y el catálogo de una tienda nueva salía
 * vacío hasta que alguien encontrara el interruptor del globo.
 *
 * Solo cambia el valor por defecto: lo que ya existe queda como estaba.
 */
export class PublicadoPorDefecto1789800000000 implements MigrationInterface {
  name = 'PublicadoPorDefecto1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "is_published" SET DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "is_published" SET DEFAULT false`,
    );
  }
}
