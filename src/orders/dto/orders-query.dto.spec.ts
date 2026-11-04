import { ApiError } from '../../http/api-error';
import { parseOrdersQuery } from './orders-query.dto';

describe('parseOrdersQuery', () => {
  it('applies defaults and accepts the published state/date filters', () => {
    expect(parseOrdersQuery({ state: 'PAGADO', from: '2026-09-01', to: '2026-09-30' })).toEqual({
      page: 0,
      pageSize: 10,
      state: 'PAGADO',
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('accepts one-sided inclusive date filters and local pagination', () => {
    expect(parseOrdersQuery({ from: '2026-10-01', page: '2', pageSize: '20' })).toEqual({
      page: 2,
      pageSize: 20,
      from: '2026-10-01',
    });
  });

  it.each(['2026-2-01', '2026-02-30', '2026-13-01', 'yesterday'])('rejects invalid calendar date %s before provider selection', (from) => {
    expect(() => parseOrdersQuery({ from })).toThrow(ApiError);
    try {
      parseOrdersQuery({ from });
    } catch (error) {
      expect((error as ApiError).getResponse()).toMatchObject({ code: 'FORMATO_INVALIDO' });
    }
  });

  it.each([
    ['2026-10-02', '2026-10-01'],
    ['2025-10-01', '2026-10-02'],
  ])('rejects an inverted or over-one-year range (%s..%s)', (from, to) => {
    expect(() => parseOrdersQuery({ from, to })).toThrow(ApiError);
    try {
      parseOrdersQuery({ from, to });
    } catch (error) {
      expect((error as ApiError).getResponse()).toMatchObject({ code: 'RANGO_FECHAS_INVALIDO' });
    }
  });

  it('rejects unsupported states, customer identity and pagination before provider selection', () => {
    for (const query of [
      { state: 'UNKNOWN' },
      { customerId: 'customer-demo-002' },
      { page: '-1' },
      { pageSize: '51' },
    ]) {
      expect(() => parseOrdersQuery(query)).toThrow(ApiError);
    }
  });
});
