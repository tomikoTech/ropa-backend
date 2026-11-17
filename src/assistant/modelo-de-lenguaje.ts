import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

/** Un mensaje de la conversación en el formato de la API de chat. */
export type MensajeDelModelo =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: LlamadaAHerramienta[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface LlamadaAHerramienta {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface RespuestaDelModelo {
  content: string | null;
  tool_calls?: LlamadaAHerramienta[];
}

/**
 * La única puerta hacia el proveedor del modelo (DeepSeek V4-Flash, por su API
 * compatible con OpenAI). Está aparte para que el agente se pueda probar con
 * un modelo de mentira y para que cambiar de proveedor sea tocar un archivo.
 *
 * La llave vive en `DEEPSEEK_API_KEY`. Los errores del proveedor se registran,
 * pero al usuario le llega un mensaje neutro: nada de detalle interno.
 */
@Injectable()
export class ModeloDeLenguaje {
  private readonly logger = new Logger('Asistente');
  private readonly endpoint = 'https://api.deepseek.com/chat/completions';
  private readonly modelo = 'deepseek-chat'; // V4-Flash (modo sin razonamiento)

  async completar(
    messages: MensajeDelModelo[],
    tools?: unknown[],
  ): Promise<RespuestaDelModelo> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      this.logger.warn('DEEPSEEK_API_KEY no está configurada.');
      throw new ServiceUnavailableException(
        'El asistente no está disponible en este momento.',
      );
    }

    let res: Response;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.modelo,
          messages,
          ...(tools?.length ? { tools, tool_choice: 'auto' } : {}),
          // Bajo: con datos de por medio no hay nada que inventar.
          temperature: 0.2,
          max_tokens: 900,
          stream: false,
        }),
        // Que una respuesta colgada no deje al usuario mirando el «pensando».
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      this.logger.error(`No se pudo conectar con DeepSeek: ${String(e)}`);
      throw new ServiceUnavailableException(
        'No pudimos conectar con el asistente. Intenta de nuevo en un momento.',
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(
        `DeepSeek respondió ${res.status}: ${body.slice(0, 500)}`,
      );
      throw new ServiceUnavailableException(
        'El asistente no está disponible en este momento.',
      );
    }

    const data = (await res.json().catch(() => null)) as {
      choices?: { message?: RespuestaDelModelo }[];
    } | null;
    const message = data?.choices?.[0]?.message;
    if (!message) {
      this.logger.error('DeepSeek no devolvió mensaje.');
      throw new ServiceUnavailableException(
        'El asistente no devolvió respuesta. Intenta de nuevo.',
      );
    }
    return { content: message.content ?? null, tool_calls: message.tool_calls };
  }
}
