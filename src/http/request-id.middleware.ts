/**
 * Middleware global de correlación — `X-Request-Id`.
 *
 * Contrato API F-011 v1 §3: el id es opcional para el consumidor; si falta
 * (o no es seguro), Marketplace genera uno y lo devuelve en la respuesta.
 * El valor queda en `request.requestId` para que los filtros de error lo
 * incluyan en el sobre `application/problem+json` (§4).
 *
 * @see SPECS/contrato-api/F-011-detalle-producto.md
 */

import { randomUUID } from 'node:crypto';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Formato aceptado: 1–64 caracteres seguros para header (UUID u opaco). */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/u;

export interface RequestWithRequestId {
  headers?: Record<string, string | string[] | undefined>;
  requestId?: string;
}

export interface HeaderResponse {
  setHeader(name: string, value: string): void;
}

/**
 * Asegura `X-Request-Id` en toda respuesta: conserva el del consumidor si es
 * seguro, genera un UUID si falta o es inválido (inyección de header) y lo
 * registra en la petición para filtros e interceptores.
 */
export function requestIdMiddleware(
  request: RequestWithRequestId,
  response: HeaderResponse,
  next: () => void,
): void {
  const raw = request.headers?.['x-request-id'];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const requestId =
    typeof candidate === 'string' && SAFE_REQUEST_ID.test(candidate)
      ? candidate
      : randomUUID();
  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}
