import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import type { Request } from 'express';
import { AccessService } from './access.service.js';
import {
  AssignAccessDto,
  CreateAccessRoleDto,
  UpdateAccessRoleDto,
} from './dto/access.dto.js';
import { TenantId } from '../common/decorators/tenant-id.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Role } from '../common/enums/role.enum.js';
import type { ModulePermission } from './role-templates.js';

/** Lo que el guard de JWT deja en la petición. */
interface AuthedRequest extends Request {
  user: {
    id: string;
    tenantId: string;
    role: Role;
    accessRoleId: string | null;
  };
}

function toMatrix(
  permissions?: {
    module: string;
    list?: boolean;
    create?: boolean;
    edit?: boolean;
    delete?: boolean;
  }[],
): ModulePermission[] | undefined {
  return permissions?.map((p) => ({
    module: p.module,
    list: !!p.list,
    create: !!p.create,
    edit: !!p.edit,
    delete: !!p.delete,
  }));
}

/**
 * Roles y permisos (F8).
 *
 * Administrar accesos es de administradores: va con `RolesGuard` de verdad
 * además de la matriz, para que un colaborador sin rol de acceso asignado
 * (que el guard de permisos deja pasar por compatibilidad) no pueda entrar a
 * darse permisos.
 */
@ApiTags('Accesos')
@ApiBearerAuth()
@Controller('access')
export class AccessController {
  constructor(private readonly access: AccessService) {}

  /**
   * Qué puede hacer el usuario que pregunta. Cualquiera puede consultarlo: es
   * lo que usa la interfaz para no mostrar botones que van a fallar.
   */
  @Get('me')
  @ApiOperation({ summary: 'Permisos del usuario actual' })
  me(@Req() req: AuthedRequest) {
    return this.access.effectiveFor(req.user);
  }

  @Get('catalog')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Módulos, acciones y plantillas disponibles' })
  catalog() {
    return this.access.catalog();
  }

  @Get('templates/:key')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Matriz completa de una plantilla' })
  template(@Param('key') key: string) {
    return this.access.template(key);
  }

  @Get('roles')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Roles de la tienda' })
  listRoles(@TenantId() tenantId: string) {
    return this.access.listRoles(tenantId);
  }

  @Get('roles/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Un rol con su matriz' })
  getRole(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.access.getRole(id, tenantId);
  }

  @Post('roles/desde-plantilla/:templateKey')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'El rol de una plantilla, creándolo si falta',
    description:
      'Idempotente: si ya existe lo devuelve. Sirve para dar de alta un ' +
      'vendedor sin salir de la pantalla de usuarios, y enciende de paso lo ' +
      'que ese perfil necesita en la tienda (lo dice en `seEncendio`).',
  })
  roleFromTemplate(
    @Param('templateKey') templateKey: string,
    @TenantId() tenantId: string,
  ) {
    return this.access.roleFromTemplate(templateKey, tenantId);
  }

  @Post('roles')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Crear un rol (desde plantilla o desde cero)' })
  createRole(@Body() dto: CreateAccessRoleDto, @TenantId() tenantId: string) {
    return this.access.createRole(
      {
        name: dto.name,
        description: dto.description,
        templateKey: dto.templateKey,
        permissions: toMatrix(dto.permissions),
      },
      tenantId,
    );
  }

  @Patch('roles/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Editar un rol y su matriz' })
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateAccessRoleDto,
    @TenantId() tenantId: string,
  ) {
    return this.access.updateRole(
      id,
      {
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
        permissions: toMatrix(dto.permissions),
      },
      tenantId,
    );
  }

  @Delete('roles/:id')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Borrar un rol que nadie esté usando' })
  deleteRole(@Param('id') id: string, @TenantId() tenantId: string) {
    return this.access.deleteRole(id, tenantId);
  }

  @Get('users/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Rol y bodegas asignadas a un usuario' })
  userAccess(@Param('userId') userId: string, @TenantId() tenantId: string) {
    return this.access.userAccess(userId, tenantId);
  }

  @Patch('users/:userId')
  @UseGuards(RolesGuard)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Asignar rol y bodegas a un usuario' })
  assign(
    @Param('userId') userId: string,
    @Body() dto: AssignAccessDto,
    @TenantId() tenantId: string,
  ) {
    return this.access.assignToUser(
      userId,
      { accessRoleId: dto.accessRoleId, warehouseIds: dto.warehouseIds },
      tenantId,
    );
  }
}
