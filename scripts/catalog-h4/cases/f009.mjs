export const cases = [
  ...['NAME_ASC', 'NAME_DESC'].map(sort => ({ id: 'F009-' + sort, feature: 'F009', async run(c) {
    const result = await c.page({ sort });
    c.state[sort] = result;
    if (!result.data.length) c.inconclusive('NO_SORT_DATA');
  } })),
  { id: 'F009-observed-ties', feature: 'F009', async run(c) {
    const result = c.need('NAME_DESC');
    let ties = 0;
    for (let i = 1; i < result.data.length; i++) {
      const a = result.data[i-1], b = result.data[i];
      if (a.name === b.name) { ties++; c.requireCheck(a.productId < b.productId, 'OBSERVED_TIE_ORDER'); }
    }
    if (!ties) c.inconclusive('NO_EQUAL_NAMES_IN_SAMPLE');
  } },
  { id: 'F009-invalid-sort', feature: 'F009', async run(c) {
    c.requireCheck((await c.get('/products?sort=NAME_ASC%3BDROP', 400)).code === 'INVALID_SORT', 'SORT_VALIDATION');
  } },
];
