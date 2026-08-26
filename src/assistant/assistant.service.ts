import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PINTOSO_SYSTEM_PROMPT } from './pintoso.prompt.js';
import { construirPayloadMensajes, MensajeChat } from './mensajes.js';

/**
 * Pintoso habla con DeepSeek (V4-Flash) por su API compatible con OpenAI.
 *
 * La llave vive en `DEEPSEEK_API_KEY` (se pone en Railway). El servidor arma el
 * mensaje con el system prompt de primero —que el cliente nunca ve— y devuelve
 * solo el texto. Los errores del proveedor se registran, pero al usuario le
 * llega un mensaje neutro: nada de filtrar detalle interno.
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger('Pintoso');
  private readonly endpoint = 'https://api.deepseek.com/chat/completions';
  private readonly modelo = 'deepseek-chat'; // V4-Flash (modo sin razonamiento)

  async chat(historial: MensajeChat[]): Promise<{ reply: string }> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      this.logger.warn('DEEPSEEK_API_KEY no está configurada; Pintoso no puede responder.');
      throw new ServiceUnavailableException(
        'El asistente no está disponible en este momento.',
      );
    }

    const messages = construirPayloadMensajes(PINTOSO_SYSTEM_PROMPT, historial);

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
          // Bajo, para que oriente parejo y no se ponga creativo con los pasos.
          temperature: 0.3,
          // Respuestas cortas: atención, no ensayos.
          max_tokens: 600,
          stream: false,
        }),
      });
    } catch (e) {
      this.logger.error(`No se pudo conectar con DeepSeek: ${String(e)}`);
      throw new ServiceUnavailableException(
        'No pudimos conectar con el asistente. Intenta de nuevo en un momento.',
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`DeepSeek respondió ${res.status}: ${body.slice(0, 500)}`);
      throw new ServiceUnavailableException(
        'El asistente no está disponible en este momento.',
      );
    }

    const data = (await res.json().catch(() => null)) as {
      choices?: { message?: { content?: string } }[];
    } | null;
    const reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      this.logger.error('DeepSeek no devolvió contenido.');
      throw new ServiceUnavailableException(
        'El asistente no devolvió respuesta. Intenta de nuevo.',
      );
    }
    return { reply };
  }
}
