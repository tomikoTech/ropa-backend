import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminORolConPermisoGuard } from './admin-o-rol-con-permiso.guard.js';
import { Role } from '../enums/role.enum.js';

const con = (user: object | undefined) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

describe('AdminORolConPermisoGuard', () => {
  const guard = new AdminORolConPermisoGuard();

  it('deja al ADMIN y al SUPER_ADMIN', () => {
    expect(guard.canActivate(con({ role: Role.ADMIN }))).toBe(true);
    expect(guard.canActivate(con({ role: Role.SUPER_ADMIN }))).toBe(true);
  });

  it('deja al colaborador con rol de acceso (la matriz ya lo revisó)', () => {
    expect(
      guard.canActivate(
        con({ role: Role.COLABORADOR, accessRoleId: 'rol-administrador' }),
      ),
    ).toBe(true);
  });

  it('no deja al colaborador sin rol de acceso', () => {
    expect(() =>
      guard.canActivate(con({ role: Role.COLABORADOR, accessRoleId: null })),
    ).toThrow(ForbiddenException);
  });
});
