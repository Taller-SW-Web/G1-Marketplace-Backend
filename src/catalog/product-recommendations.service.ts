/**
 * Servicio BFF — Productos relacionados (F-015)
 *
 * Región no crítica: cualquier fallo técnico se degrada a arreglo vacío para
 * no bloquear la ficha (RN-F015-05). Aun así el BFF filtra candidatos
 * incompletos, deduplica y excluye el producto de origen antes de responder.
 *
 * ⚠️ MOCK — Mientras I-01 esté bloqueado sólo se sirven fixtures.
 *
 * @see SPECS/contrato-api/F-015-productos-relacionados.md
 */

import { Injectable } from '@nestjs/common';
import {
  isRecommendationCard,
  isRecommendationsResponse,
  MAX_RECOMMENDATIONS,
  type RecommendationCardDTO,
  type RecommendationsResponseDTO,
} from './product-recommendations.dto';
import { MOCK_RECOMMENDATIONS_BY_SLUG } from './product-recommendations.fixture';

const MOCK_LATENCY_MS = 90;

function simulateLatency(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, MOCK_LATENCY_MS));
}

function empty(sourceProductId: string): RecommendationsResponseDTO {
  return { data: [], meta: { sourceProductId } };
}

@Injectable()
export class ProductRecommendationsService {
  /**
   * Obtiene hasta 8 tarjetas completas, sin duplicados ni el producto origen.
   *
   * @param slug - Slug ya validado por el controlador
   */
  async getRecommendations(slug: string): Promise<RecommendationsResponseDTO> {
    const bffMode = process.env.BFF_MODE ?? 'mock';
    if (bffMode !== 'mock') {
      // Sin adaptador homologado (I-01) la región se omite, no se inventa.
      return empty('UNCONFIGURED');
    }

    await simulateLatency();

    const fixture = MOCK_RECOMMENDATIONS_BY_SLUG.get(slug);
    if (!fixture) return empty('UNKNOWN');

    const seen = new Set<string>();
    const cards: RecommendationCardDTO[] = [];
    for (const candidate of fixture.candidates) {
      if (!isRecommendationCard(candidate)) continue;
      if (candidate.productId === fixture.sourceProductId) continue;
      if (seen.has(candidate.productId)) continue;
      seen.add(candidate.productId);
      cards.push(candidate);
      if (cards.length === MAX_RECOMMENDATIONS) break;
    }

    const response: RecommendationsResponseDTO = {
      data: cards,
      meta: { sourceProductId: fixture.sourceProductId },
    };

    // Defensa final: una respuesta que no cumpla el contrato se omite.
    return isRecommendationsResponse(response)
      ? response
      : empty(fixture.sourceProductId);
  }
}
