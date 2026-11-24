import { createMockProvider } from './fixtures';
import { parseQuery } from './query';
import type { ProductCardDTO } from './types';

it.each(['NAME_ASC', 'NAME_DESC'])('keeps ID ascending for equal names across %s page boundaries', async sort => {
  const products: ProductCardDTO[] = ['c', 'a', 'b'].map(productId => ({ productId, name: 'Same name',
    slug: 'product-'+productId, categoryId: 'running', brandId: 'mock-brand', image: null }));
  const provider = createMockProvider({ products });
  const query = parseQuery(new URLSearchParams({ sort, pageSize: '1' }));
  const pages = await Promise.all([0, 1, 2].map(page => provider.search({ ...query, page })));
  expect(pages.flatMap(p => p.data.map(card => card.productId))).toEqual(['a', 'b', 'c']);
});
