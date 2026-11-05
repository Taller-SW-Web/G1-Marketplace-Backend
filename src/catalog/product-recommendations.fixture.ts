/**
 * ⚠️ MOCK — Solo desarrollo local / H3-H4. No usar en producción.
 *
 * Fixtures de recomendaciones para
 * `GET /api/v1/catalog/products/:slug/recommendations`.
 * Simulan `EXT-OUT-REC-01` ya enriquecido con Catálogo. Incluyen candidatos
 * inválidos y duplicados para verificar el filtrado del servicio.
 *
 * @see SPECS/contrato-api/F-015-productos-relacionados.md · Gate I-01
 */

import {
  MOCK_SIMPLE_PRODUCT_ID,
  MOCK_VARIABLE_PRODUCT_ID,
  MOCK_VARIABLE_SLUG,
  mockDemoProductId,
} from './mock-sku';
import type {
  RecommendationCardDTO,
  RecommendationType,
} from './product-recommendations.dto';

export interface MockRecommendationsFixture {
  sourceProductId: string;
  /** Candidatos de origen; el servicio descarta los incompletos. */
  candidates: unknown[];
}

const DEMO_NAMES = [
  'Zapatillas de running',
  'Polo de entrenamiento',
  'Mochila deportiva',
  'Short de running',
];

function demoName(number: number): string {
  return `${DEMO_NAMES[(number - 1) % DEMO_NAMES.length]} ${String(number).padStart(2, '0')}`;
}

function demoCard(
  number: number,
  presentationOrder: number,
  type: RecommendationType,
  withPrice: boolean,
): RecommendationCardDTO {
  return {
    productId: mockDemoProductId(number),
    slug: `producto-demostracion-${number}`,
    name: demoName(number),
    image: {
      url: `https://placehold.co/600x400?text=${number}A`,
      alt: `${demoName(number)} [MOCK]`,
    },
    type,
    price: withPrice
      ? { amount: Math.round((79.9 + number * 10) * 100) / 100, currency: 'PEN' }
      : null,
    presentationOrder,
  };
}

function relatedToDemo(number: number): MockRecommendationsFixture {
  const candidates = [1, 2, 3].map((offset) => {
    const target = ((number - 1 + offset) % 32) + 1;
    return demoCard(
      target,
      offset,
      offset === 2 ? 'UPSELL' : 'CROSS_SELL',
      offset !== 3,
    );
  });
  return { sourceProductId: mockDemoProductId(number), candidates };
}

const entries: Array<[string, MockRecommendationsFixture]> = [
  [
    'zapatillas-running-aero-x',
    {
      sourceProductId: MOCK_SIMPLE_PRODUCT_ID,
      candidates: [1, 2, 3, 4].map((number, index) =>
        demoCard(number, index + 1, index % 2 === 0 ? 'CROSS_SELL' : 'UPSELL', index !== 2),
      ),
    },
  ],
  [
    MOCK_VARIABLE_SLUG,
    {
      sourceProductId: MOCK_VARIABLE_PRODUCT_ID,
      candidates: [5, 6, 7].map((number, index) =>
        demoCard(number, index + 1, 'CROSS_SELL', true),
      ),
    },
  ],
  [
    'producto-sin-relacionados-mock',
    { sourceProductId: 'PRD-MOCK-NONE', candidates: [] },
  ],
  [
    'producto-relacionados-invalidos-mock',
    {
      sourceProductId: 'PRD-MOCK-NONE',
      candidates: [
        demoCard(8, 1, 'CROSS_SELL', true),
        { ...demoCard(9, 2, 'UPSELL', true), image: null },
        demoCard(8, 3, 'UPSELL', true), // duplicado por productId/slug
        { ...demoCard(10, 4, 'CROSS_SELL', true), productId: 'PRD-MOCK-NONE' },
      ],
    },
  ],
  // Fallo técnico simulado: la región se degrada a vacío (no hay error visible).
  [
    'producto-error-recomendaciones-mock',
    { sourceProductId: 'PRD-MOCK-NONE', candidates: [] },
  ],
  ...Array.from({ length: 32 }, (_, index) => {
    const number = index + 1;
    return [
      `producto-demostracion-${number}`,
      relatedToDemo(number),
    ] as [string, MockRecommendationsFixture];
  }),
];

/** Índice slug → recomendaciones MOCK. Desconocido → arreglo vacío. */
export const MOCK_RECOMMENDATIONS_BY_SLUG: ReadonlyMap<
  string,
  MockRecommendationsFixture
> = new Map(entries);
