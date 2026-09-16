import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * La plantilla de la vitrina: qué referencias tienen puesto en el aparador.
 *
 * La vitrina no es solo lo que hay: es lo que **debe** haber. Se vendió la
 * muestra y la referencia no sale de la vitrina, queda un hueco que hay que
 * reponer —del local, o pidiéndolo a otra bodega—. Una referencia entra a la
 * plantilla la primera vez que se exhibe y sale cuando la tienda decide que
 * ya no se muestra. Ver `plantilla-de-vitrina.ts`.
 */
@Entity('vitrina_plantilla')
@Unique(['vitrinaId', 'productId'])
export class VitrinaPlantilla {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Index()
  @Column({ name: 'vitrina_id', type: 'uuid' })
  vitrinaId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
