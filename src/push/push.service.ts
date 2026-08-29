import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import webpush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity.js';

export interface PushPayload {
  title: string;
  body: string;
  /** A dónde abrir al tocar la notificación. */
  url?: string | null;
  tag?: string;
}

/**
 * Envío de notificaciones push (Web Push, estándar de navegadores).
 *
 * Las llaves VAPID van por entorno: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y
 * `VAPID_SUBJECT` (un mailto:). Sin ellas, el push queda apagado y todo lo demás
 * (avisos en la app) sigue igual — así el sistema no se cae si faltan.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly habilitado: boolean;

  constructor(
    @InjectRepository(PushSubscription)
    private readonly repo: Repository<PushSubscription>,
  ) {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:soporte@mipinta.co';
    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.habilitado = true;
    } else {
      this.habilitado = false;
      this.logger.warn(
        'Push desactivado: faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.',
      );
    }
  }

  estaHabilitado(): boolean {
    return this.habilitado;
  }

  clavePublica(): string | null {
    return process.env.VAPID_PUBLIC_KEY?.trim() || null;
  }

  /** Guarda (o actualiza) la suscripción de un dispositivo. */
  async suscribir(
    userId: string,
    tenantId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string | null,
  ): Promise<void> {
    const existente = await this.repo.findOne({
      where: { endpoint: sub.endpoint },
    });
    if (existente) {
      await this.repo.update(
        { id: existente.id },
        {
          userId,
          tenantId,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          userAgent: userAgent ?? null,
        },
      );
      return;
    }
    await this.repo.save(
      this.repo.create({
        userId,
        tenantId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent ?? null,
      }),
    );
  }

  async desuscribir(endpoint: string): Promise<void> {
    await this.repo.delete({ endpoint });
  }

  /**
   * Manda el push a todos los dispositivos de esas personas. Es **fire-and-
   * forget**: no se espera a la red (que puede tardar), para no demorar la
   * venta ni la respuesta de la API. Las suscripciones caducadas se borran.
   */
  async enviarAUsuarios(
    userIds: string[],
    tenantId: string,
    payload: PushPayload,
  ): Promise<void> {
    if (!this.habilitado) return;
    const destinatarios = [...new Set(userIds)].filter(Boolean);
    if (destinatarios.length === 0) return;

    const subs = await this.repo.find({
      where: { userId: In(destinatarios), tenantId },
    });
    if (subs.length === 0) return;

    const cuerpo = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url ?? '/',
      tag: payload.tag,
    });

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            cuerpo,
          );
        } catch (err) {
          const code = (err as { statusCode?: number })?.statusCode;
          // 404/410 = el navegador ya no quiere ese endpoint: se borra.
          if (code === 404 || code === 410) {
            await this.repo.delete({ id: s.id }).catch(() => undefined);
          } else {
            this.logger.warn(`Push falló (${code ?? 'error'}) a ${s.userId}`);
          }
        }
      }),
    );
  }
}
