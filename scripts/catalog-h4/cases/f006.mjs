import { validateCard } from '../check.mjs';
export const cases = [
  { id: 'F006-home', feature: 'F006', async run(c) {
    const body = await c.get('/home');
    c.requireCheck(body && Object.keys(body).length === 2 && Array.isArray(body.categories) && Array.isArray(body.featuredProducts), 'HOME_SHAPE');
    for (const item of body.categories) c.requireCheck(item && Object.keys(item).length === 2 && typeof item.categoryId === 'string' && item.categoryId.length > 0 && typeof item.name === 'string' && item.name.length > 0, 'CATEGORY_SHAPE');
    c.requireCheck(new Set(body.categories.map(item => item.categoryId)).size === body.categories.length, 'DUPLICATE_CATEGORY');
    body.featuredProducts.forEach(item => validateCard(item, c.source));
    c.requireCheck(new Set(body.featuredProducts.map(item => item.productId)).size === body.featuredProducts.length, 'DUPLICATE_FEATURED');
    c.state.home = body;
  } },
  { id: 'F006-featured-observed', feature: 'F006', async run(c) {
    if (!c.need('home').featuredProducts.length) c.inconclusive('NO_EDITORIAL_SELECTION_OBSERVED');
  } },
  { id: 'F006-no-query', feature: 'F006', async run(c) {
    c.requireCheck((await c.get('/home?unexpected=1', 400)).code === 'INVALID_PARAMETERS', 'HOME_QUERY_VALIDATION');
  } },
];
