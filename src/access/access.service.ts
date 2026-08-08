import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AccessRole } from './entities/access-role.entity.js';
import { RolePermission } from './entities/role-permission.entity.js';
import { UserWarehouse } from './entities/user-warehouse.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Warehouse } from '../inventory/entities/warehouse.entity.js';
import { Role } from '../common/enums/role.enum.js';
import {
  ACTIONS,
  ACTION_LABELS,
  MODULES,
  MODULE_KEYS,
  type PermissionAction,
} from './module-registry.js';
import {
  ROLE_TEMPLATES,
  countGranted,
  emptyMatrix,
  findRoleTemplate,
  isEmptyMatrix,
  type ModulePermission,
} from './role-templates.js';

/** Permisos de un rol, listos para consultar. */
interface RoleAccess {
  name: string;
  /** módulo → acciones concedidas. Lo que no está, está negado. */
  modules: Map<string, Set<PermissionAction>>;
}

/**
 * Los permisos **no se cachean**, a propósito.
 *
 * Un caché en memoria haría que quitarle un permiso a alguien tardara en verse
 * en las otras instancias del backend: justo lo que no se puede permitir en un
 * control de acceso, porque el momento en que se quita un permiso es
 * normalmente el momento en que hace falta que se aplique.
 *
 * El costo real es una consulta indexada por `role_id` (una fila por módulo
 * concedido, ~30 como máximo), y la sesión ya consulta el usuario en cada
 * petición: no cambia el orden de magnitud.
 */
@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(AccessRole)
    private readonly roleRepo: Repository<AccessRole>,
    @InjectRepository(RolePermission)
    private readonly permRepo: Repository<RolePermission>,
    @InjectRepository(UserWarehouse)
    private readonly userWarehouseRepo: Repository<UserWarehouse>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Warehouse)
    private readonly warehouseRepo: Repository<Warehouse>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Catálogo y plantillas ────────────────────────────────────────────────

  catalog() {
    return {
      modules: MODULES,
      actions: ACTIONS.map((key) => ({ key, label: ACTION_LABELS[key] })),
      templates: ROLE_TEMPLATES.map((t) => ({
        key: t.key,
        name: t.name,
        description: t.description,
        granted: countGranted(t.permissions),
      })),
    };
  }

  template(key: string) {
    const found = findRoleTemplate(key);
    if (!found) {
      throw new NotFoundException(
        `No existe la plantilla "${key}". Las disponibles son: ` +
          ROLE_TEMPLATES.map((t) => t.key).join(', '),
      );
    }
    return found;
  }

  // ── Roles ────────────────────────────────────────────────────────────────

  async listRoles(tenantId: string) {
    const roles = await this.roleRepo.find({
      where: { tenantId },
      relations: ['permissions'],
      order: { name: 'ASC' },
    });

    // Cuántos usuarios tiene cada rol: es el dato que evita borrar un rol que
    // está en uso sin darse cuenta.
    const counts = await this.userRepo
      .createQueryBuilder('u')
      .select('u.access_role_id', 'roleId')
      .addSelect('COUNT(*)', 'total')
      .where('u.tenant_id = :tenantId', { tenantId })
      .andWhere('u.access_role_id IS NOT NULL')
      .groupBy('u.access_role_id')
      .getRawMany<{ roleId: string; total: string }>();
    const byRole = new Map(counts.map((c) => [c.roleId, Number(c.total)]));

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      templateKey: r.templateKey,
      isActive: r.isActive,
      users: byRole.get(r.id) ?? 0,
      granted: countGranted(this.toMatrix(r.permissions ?? [])),
    }));
  }

  async getRole(id: string, tenantId: string) {
    const role = await this.roleRepo.findOne({
      where: { id, tenantId },
      relations: ['permissions'],
    });
    if (!role) throw new NotFoundException('El rol no existe');
    return {
      id: role.id,
      name: role.name,
      description: role.description,
      templateKey: role.templateKey,
      isActive: role.isActive,
      permissions: this.toMatrix(role.permissions ?? []),
    };
  }

  /**
   * Completa la matriz con todos los módulos: lo que no tiene fila está negado.
   * Así la pantalla siempre recibe la matriz entera y no tiene que adivinar.
   */
  private toMatrix(rows: RolePermission[]): ModulePermission[] {
    const byModule = new Map(rows.map((r) => [r.module, r]));
    return MODULE_KEYS.map((module) => {
      const row = byModule.get(module);
      return {
        module,
        list: !!row?.canList,
        create: !!row?.canCreate,
        edit: !!row?.canEdit,
        delete: !!row?.canDelete,
      };
    });
  }

  async createRole(
    data: {
      name: string;
      description?: string;
      templateKey?: string;
      permissions?: ModulePermission[];
    },
    tenantId: string,
  ) {
    const name = data.name?.trim();
    if (!name) throw new BadRequestException('El rol necesita un nombre');

    const exists = await this.roleRepo.findOne({ where: { tenantId, name } });
    if (exists) {
      throw new ConflictException(
        `Ya existe un rol llamado "${name}". Usa otro nombre o edita el que ya está.`,
      );
    }

    // De la plantilla si viene, si no de lo que manden, si no vacío.
    const permissions =
      data.permissions ??
      (data.templateKey
        ? this.template(data.templateKey).permissions
        : emptyMatrix());

    const saved = await this.dataSource.transaction(async (m) => {
      const role = await m.getRepository(AccessRole).save(
        m.getRepository(AccessRole).create({
          name,
          description: data.description?.trim() || null,
          templateKey: data.templateKey ?? null,
          tenantId,
        }),
      );
      await this.writePermissions(
        m.getRepository(RolePermission),
        role.id,
        permissions,
        tenantId,
      );
      return role;
    });

    return this.getRole(saved.id, tenantId);
  }

  async updateRole(
    id: string,
    data: {
      name?: string;
      description?: string;
      isActive?: boolean;
      permissions?: ModulePermission[];
    },
    tenantId: string,
  ) {
    const role = await this.roleRepo.findOne({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('El rol no existe');

    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) throw new BadRequestException('El rol necesita un nombre');
      const clash = await this.roleRepo.findOne({ where: { tenantId, name } });
      if (clash && clash.id !== id) {
        throw new ConflictException(`Ya existe un rol llamado "${name}"`);
      }
      role.name = name;
    }
    if (data.description !== undefined) {
      role.description = data.description.trim() || null;
    }
    if (data.isActive !== undefined) role.isActive = data.isActive;

    await this.dataSource.transaction(async (m) => {
      await m.getRepository(AccessRole).save(role);
      if (data.permissions) {
        await this.writePermissions(
          m.getRepository(RolePermission),
          id,
          data.permissions,
          tenantId,
        );
      }
    });

    return this.getRole(id, tenantId);
  }

  /** Reescribe la matriz completa del rol (una fila por módulo con algo activo). */
  private async writePermissions(
    repo: Repository<RolePermission>,
    roleId: string,
    permissions: ModulePermission[],
    tenantId: string,
  ): Promise<void> {
    await repo.delete({ roleId });

    const rows = permissions
      .filter((p) => MODULE_KEYS.includes(p.module))
      // Solo se guarda lo que concede algo: la ausencia ya significa "no".
      .filter((p) => p.list || p.create || p.edit || p.delete)
      .map((p) =>
        repo.create({
          roleId,
          module: p.module,
          canList: !!p.list,
          canCreate: !!p.create,
          canEdit: !!p.edit,
          canDelete: !!p.delete,
          tenantId,
        }),
      );
    if (rows.length) await repo.save(rows);
  }

  async deleteRole(id: string, tenantId: string): Promise<{ deleted: true }> {
    const role = await this.roleRepo.findOne({ where: { id, tenantId } });
    if (!role) throw new NotFoundException('El rol no existe');

    const users = await this.userRepo.count({
      where: { tenantId, accessRoleId: id },
    });
    if (users > 0) {
      throw new ConflictException(
        `No se puede borrar "${role.name}": lo usan ${users} usuario(s). ` +
          `Cámbiales el rol primero, o desactívalo si ya no lo vas a usar.`,
      );
    }

    await this.roleRepo.delete({ id, tenantId });
    return { deleted: true };
  }

  // ── Asignación a usuarios ────────────────────────────────────────────────

  async assignToUser(
    userId: string,
    data: { accessRoleId?: string | null; warehouseIds?: string[] },
    tenantId: string,
  ) {
    const user = await this.userRepo.findOne({
      where: { id: userId, tenantId },
    });
    if (!user) throw new NotFoundException('El usuario no existe');

    if (data.accessRoleId !== undefined) {
      if (data.accessRoleId) {
        const role = await this.roleRepo.findOne({
          where: { id: data.accessRoleId, tenantId },
          relations: ['permissions'],
        });
        if (!role) throw new NotFoundException('El rol no existe');
        if (!role.isActive) {
          throw new BadRequestException(
            `El rol "${role.name}" está desactivado. Actívalo antes de asignarlo.`,
          );
        }
        if (isEmptyMatrix(this.toMatrix(role.permissions ?? []))) {
          throw new BadRequestException(
            `El rol "${role.name}" no tiene ningún permiso: quien lo tenga no ` +
              `podría hacer nada. Dale al menos permiso de ver algo.`,
          );
        }
      }
      user.accessRoleId = data.accessRoleId || null;
      await this.userRepo.save(user);
    }

    if (data.warehouseIds) {
      const ids = [...new Set(data.warehouseIds)];
      if (ids.length) {
        const found = await this.warehouseRepo.count({
          where: { id: In(ids), tenantId },
        });
        if (found !== ids.length) {
          throw new BadRequestException(
            'Alguna de las bodegas no existe o es de otra tienda',
          );
        }
      }
      await this.dataSource.transaction(async (m) => {
        const repo = m.getRepository(UserWarehouse);
        await repo.delete({ userId });
        if (ids.length) {
          await repo.save(
            ids.map((warehouseId) =>
              repo.create({ userId, warehouseId, tenantId }),
            ),
          );
        }
      });
    }

    return this.userAccess(userId, tenantId);
  }

  /** Rol y bodegas de un usuario (para el formulario de usuarios). */
  async userAccess(userId: string, tenantId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId, tenantId },
    });
    if (!user) throw new NotFoundException('El usuario no existe');
    const warehouses = await this.userWarehouseRepo.find({ where: { userId } });
    return {
      userId,
      accessRoleId: user.accessRoleId,
      warehouseIds: warehouses.map((w) => w.warehouseId),
    };
  }

  // ── Consulta de permisos (lo que usa el guard y el frontend) ─────────────

  /**
   * Permisos efectivos del usuario que está pidiendo.
   *
   * Un usuario **sin rol de acceso** recibe `unrestricted: true`: es la forma de
   * decirle al frontend "este usuario funciona como siempre", sin que el
   * frontend tenga que conocer la regla.
   */
  async effectiveFor(user: {
    id: string;
    tenantId: string;
    role: Role;
    accessRoleId: string | null;
  }) {
    const warehouses = await this.userWarehouseRepo.find({
      where: { userId: user.id },
    });
    const warehouseIds = warehouses.map((w) => w.warehouseId);

    if (user.role === Role.SUPER_ADMIN || !user.accessRoleId) {
      return {
        unrestricted: true,
        roleName: null as string | null,
        permissions: [] as ModulePermission[],
        warehouseIds,
      };
    }

    const access = await this.loadRole(user.accessRoleId);
    return {
      unrestricted: false,
      roleName: access?.name ?? null,
      permissions: MODULE_KEYS.map((module) => {
        const granted = access?.modules.get(module);
        return {
          module,
          list: !!granted?.has('list'),
          create: !!granted?.has('create'),
          edit: !!granted?.has('edit'),
          delete: !!granted?.has('delete'),
        };
      }),
      warehouseIds,
    };
  }

  /**
   * ¿Este usuario puede hacer esta acción? Resuelve también los casos en que no
   * hay matriz que aplicar (plataforma, o usuario sin rol de acceso), para que
   * quien pregunte no tenga que repetir esa regla.
   */
  async userCan(
    user: { role: Role; accessRoleId: string | null },
    module: string,
    action: PermissionAction,
  ): Promise<boolean> {
    if (user.role === Role.SUPER_ADMIN || !user.accessRoleId) return true;
    const { allowed } = await this.can(user.accessRoleId, module, action);
    return allowed;
  }

  /** ¿Este rol puede hacer esta acción en este módulo? */
  async can(
    accessRoleId: string,
    module: string,
    action: PermissionAction,
  ): Promise<{ allowed: boolean; roleName: string }> {
    const access = await this.loadRole(accessRoleId);
    if (!access) {
      // El rol se borró mientras la sesión seguía viva: se niega y se dice.
      return { allowed: false, roleName: 'desconocido' };
    }
    return {
      allowed: !!access.modules.get(module)?.has(action),
      roleName: access.name,
    };
  }

  /**
   * Bodegas permitidas para un usuario, o `null` si no tiene restricción.
   * `null` (y no lista vacía) porque "sin bodegas asignadas" significa *todas*.
   */
  async allowedWarehouses(userId: string): Promise<string[] | null> {
    const rows = await this.userWarehouseRepo.find({ where: { userId } });
    return rows.length ? rows.map((r) => r.warehouseId) : null;
  }

  /** Deja pasar solo las bodegas del usuario (o todas si no está restringido). */
  async filterWarehouses<T extends { id: string }>(
    userId: string,
    warehouses: T[],
  ): Promise<T[]> {
    const allowed = await this.allowedWarehouses(userId);
    if (!allowed) return warehouses;
    const set = new Set(allowed);
    return warehouses.filter((w) => set.has(w.id));
  }

  private async loadRole(roleId: string): Promise<RoleAccess | null> {
    const role = await this.roleRepo.findOne({
      where: { id: roleId },
      relations: ['permissions'],
    });
    // Rol borrado o desactivado mientras la sesión seguía viva: no concede nada.
    if (!role || !role.isActive) return null;

    const modules = new Map<string, Set<PermissionAction>>();
    for (const p of role.permissions ?? []) {
      const granted = new Set<PermissionAction>();
      if (p.canList) granted.add('list');
      if (p.canCreate) granted.add('create');
      if (p.canEdit) granted.add('edit');
      if (p.canDelete) granted.add('delete');
      if (granted.size) modules.set(p.module, granted);
    }

    return { name: role.name, modules };
  }
}
