import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessRole } from './entities/access-role.entity.js';
import { RolePermission } from './entities/role-permission.entity.js';
import { UserWarehouse } from './entities/user-warehouse.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { AccessService } from './access.service.js';
import { AccessController } from './access.controller.js';

/**
 * Módulo de accesos (F8).
 *
 * Es `@Global` porque el guard de permisos es global y otros módulos necesitan
 * las bodegas permitidas del usuario (POS, inventario, traslados). Importarlo en
 * cada uno solo agregaría ruido.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AccessRole,
      RolePermission,
      UserWarehouse,
      User,
      Warehouse,
    ]),
  ],
  controllers: [AccessController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
