/**
 * Excepción HTTP de los endpoints BFF de catálogo F-012…F-015.
 *
 * Comparte el sobre interno `{ error: { code, message } }` con
 * `CatalogException` (F-011): `ProblemDetailsFilter` lo traduce a
 * `application/problem+json` y el middleware de correlación garantiza
 * `X-Request-Id`.
 *
 * El `code` es el publicado por cada contrato (F-012/F-013/F-014) y nunca se
 * reemplaza por el código interno del proveedor externo.
 */

import { HttpException } from '@nestjs/common';

export class BffCatalogException extends HttpException {
  constructor(status: number, code: string, message: string) {
    super({ error: { code, message } }, status);
  }
}
