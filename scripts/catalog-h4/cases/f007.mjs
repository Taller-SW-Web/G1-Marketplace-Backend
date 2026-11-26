export const cases = [
  { id: 'F007-positive', feature: 'F007', async run(c) {
    const result = await c.page({ q: c.query });
    if (!result.data.length) c.inconclusive('NO_POSITIVE_SEARCH_DATA');
  } },
  { id: 'F007-empty', feature: 'F007', async run(c) {
    const result = await c.page({ q: c.emptyQuery });
    if (result.page.totalElements !== 0) c.inconclusive('EMPTY_QUERY_MATCHED_DATA');
  } },
  ...['x', 'x'.repeat(121)].map((q, index) => ({ id: 'F007-length-' + index, feature: 'F007', async run(c) {
    c.requireCheck((await c.get('/products?' + new URLSearchParams({ q }), 400)).code === 'INVALID_SEARCH_QUERY', 'SEARCH_LENGTH_VALIDATION');
  } })),
];
