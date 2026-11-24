export const cases = [
  { id: 'F010-first', feature: 'F010', async run(c) { c.state.first = await c.page({ sort: 'NAME_ASC' }); } },
  { id: 'F010-next', feature: 'F010', async run(c) {
    const first = c.need('first');
    if (first.page.totalPages < 2) c.inconclusive('NO_SECOND_PAGE_DATA');
    const next = await c.page({ sort: 'NAME_ASC', page: '1' });
    if (first.page.totalElements !== next.page.totalElements) c.inconclusive('CATALOG_CHANGED_BETWEEN_READS');
    const ids = [...first.data, ...next.data].map(item => item.productId);
    c.requireCheck(new Set(ids).size === ids.length, 'DUPLICATE_ACROSS_PAGES');
  } },
  { id: 'F010-last', feature: 'F010', async run(c) {
    const first = c.need('first');
    const last = await c.page({ sort: 'NAME_ASC', page: String(Math.max(0, first.page.totalPages - 1)) });
    if (last.page.totalElements !== first.page.totalElements) c.inconclusive('CATALOG_CHANGED_BETWEEN_READS');
  } },
  { id: 'F010-out-of-range', feature: 'F010', async run(c) {
    const first = c.need('first');
    const body = await c.page({ sort: 'NAME_ASC', page: String(first.page.totalPages + 1) });
    if (body.page.totalElements !== first.page.totalElements) c.inconclusive('CATALOG_CHANGED_BETWEEN_READS');
    c.requireCheck(body.data.length === 0, 'OUT_OF_RANGE_NOT_EMPTY');
  } },
  ...['page=-1', 'pageSize=49', 'pageSize=0'].map((query, index) => ({ id: 'F010-limit-' + index, feature: 'F010', async run(c) {
    c.requireCheck((await c.get('/products?' + query, 400)).code === 'INVALID_PAGE', 'PAGE_VALIDATION');
  } })),
];
