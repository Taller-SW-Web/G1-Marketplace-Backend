export const cases = [
  { id: 'F008-masters', feature: 'F008', async run(c) {
    const body = await c.get('/filters');
    c.requireCheck(body && Object.keys(body).length === 2 && Array.isArray(body.categories) && Array.isArray(body.brands), 'MASTERS_SHAPE');
    for (const [list, key] of [[body.categories, 'categoryId'], [body.brands, 'brandId']]) {
      c.requireCheck(new Set(list.map(item => item[key])).size === list.length, 'DUPLICATE_MASTER');
      list.forEach(item => c.requireCheck(item && Object.keys(item).length === 2 && typeof item[key] === 'string' && item[key].length > 0 && typeof item.name === 'string' && item.name.length > 0, 'MASTER_SHAPE'));
    }
    c.state.masters = body;
  } },
  { id: 'F008-category', feature: 'F008', async run(c) {
    const category = c.need('masters').categories[0];
    if (!category) c.inconclusive('NO_CATEGORY_DATA');
    const body = await c.page({ categoryIds: category.categoryId });
    c.requireCheck(body.data.every(item => item.categoryId === category.categoryId), 'CATEGORY_NOT_APPLIED');
  } },
  { id: 'F008-combined', feature: 'F008', async run(c) {
    const masters = c.need('masters'), category = masters.categories[0], brand = masters.brands[0];
    if (!category || !brand) c.inconclusive('NO_COMBINED_MASTER_DATA');
    const body = await c.page({ categoryIds: category.categoryId, brandIds: brand.brandId, minPrice: '0', maxPrice: '100', sort: 'NAME_ASC' });
    c.requireCheck(body.data.every(item => item.categoryId === category.categoryId && item.brandId === brand.brandId), 'COMBINED_FILTER_NOT_APPLIED');
  } },
  { id: 'F008-price-protocol', feature: 'F008', async run(c) { await c.page({ minPrice: '0', maxPrice: '100' }); } },
  ...[['minPrice=20&maxPrice=10', 'INVALID_PRICE_RANGE'], ['minPrice=-1', 'INVALID_PRICE_RANGE'], ['categoryIds=..%2Fprivate', 'INVALID_FILTER']]
    .map(([query, code], index) => ({ id: 'F008-negative-' + index, feature: 'F008', async run(c) {
      c.requireCheck((await c.get('/products?' + query, 400)).code === code, 'FILTER_VALIDATION');
    } })),
];
