import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Role } from '../common/enums/role.enum.js';
import { PushService } from '../push/push.service.js';

export interface NuevaNotificacion {
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  /** Base para no repetir; se combina con cada userId. */
  dedupeKey?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly push: PushService,
  ) {}

  /** Los admins del tenant: los que autorizan y a quienes se les avisa. */
  async idsDeAdmins(tenantId: string, excluir?: string | null): Promise<string[]> {
    const admins = await this.userRepo.find({
      where: { tenantId, role: Role.ADMIN, isActive: true },
      select: { id: true },
    });
    return admins.map((u) => u.id).filter((id) => id !== excluir);
  }

  /**
   * Crea el aviso para varias personas. Devuelve las notificaciones creadas
   * (para, en el paso de push, saber a quién mandarle al teléfono).
   *
   * Nunca tumba la operación que la disparó: si algo falla acá, la venta o la
   * solicitud ya se guardaron; el aviso es secundario.
   */
  async crearPara(
    userIds: string[],
    tenantId: string,
    data: NuevaNotificacion,
  ): Promise<Notification[]> {
    const destinatarios = [...new Set(userIds)].filter(Boolean);
    if (destinatarios.length === 0) return [];
    try {
      const creadas: Notification[] = [];
      for (const userId of destinatarios) {
        const dedupeKey = data.dedupeKey
          ? `${data.dedupeKey}:${userId}`
          : null;
        if (dedupeKey) {
          const yaExiste = await this.repo.findOne({
            where: { tenantId, userId, dedupeKey },
          });
          if (yaExiste) continue;
        }
        const n = this.repo.create({
          tenantId,
          userId,
          type: data.type,
          title: data.title,
          body: data.body,
          link: data.link ?? null,
          dedupeKey,
          readAt: null,
        });
        creadas.push(await this.repo.save(n));
      }
      // Además del aviso en la app, al celular. Fire-and-forget: no se espera a
      // la red, para no demorar la venta ni la respuesta de la API.
      if (creadas.length > 0) {
        void this.push
          .enviarAUsuarios(
            creadas.map((c) => c.userId),
            tenantId,
            {
              title: data.title,
              body: data.body,
              url: data.link ?? '/',
              tag: data.type,
            },
          )
          .catch(() => undefined);
      }
      return creadas;
    } catch {
      // El aviso es "mejor esfuerzo": no rompe la acción que lo originó.
      return [];
    }
  }

  async listar(
    userId: string,
    tenantId: string,
    opciones: { soloNoLeidas?: boolean; limit?: number } = {},
  ): Promise<Notification[]> {
    const limit = Math.min(Math.max(opciones.limit ?? 30, 1), 100);
    return this.repo.find({
      where: {
        userId,
        tenantId,
        ...(opciones.soloNoLeidas ? { readAt: IsNull() } : {}),
      },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async contarNoLeidas(userId: string, tenantId: string): Promise<number> {
    return this.repo.count({ where: { userId, tenantId, readAt: IsNull() } });
  }

  async marcarLeida(id: string, userId: string, tenantId: string): Promise<void> {
    await this.repo.update(
      { id, userId, tenantId },
      { readAt: new Date() },
    );
  }

  async marcarTodasLeidas(userId: string, tenantId: string): Promise<void> {
    await this.repo.update(
      { userId, tenantId, readAt: IsNull() },
      { readAt: new Date() },
    );
  }
}
