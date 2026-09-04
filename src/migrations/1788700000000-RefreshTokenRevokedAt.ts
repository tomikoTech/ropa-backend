import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `revoked_at` en `refresh_tokens`: cuándo se revocó un token por ROTACIÓN.
 *
 * Habilita la ventana de gracia del refresh (ver AuthService.refreshTokens): un
 * token rotado hace pocos segundos que vuelve a llegar —una carrera entre
 * pestañas del POS, o un refresh cuya respuesta se perdió por red— todavía se
 * acepta, en vez de sacar al usuario a login por algo transitorio.
 *
 * Nulable: los tokens ya revocados (por rotación vieja o por cierre de sesión)
 * quedan con `null`, que la lógica trata como "fuera de la gracia" — no abre la
 * puerta a nada que antes estuviera cerrado.
 */
export class RefreshTokenRevokedAt1788700000000 implements MigrationInterface {
  name = 'RefreshTokenRevokedAt1788700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "revoked_at" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "revoked_at"`,
    );
  }
}
