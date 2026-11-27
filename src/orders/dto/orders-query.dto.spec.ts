import { parseOrdersQuery } from './orders-query.dto';

describe('parseOrdersQuery', () => {
  it('defaults to the first page and accepts independent date filters', () => {
    expect(parseOrdersQuery({})).toEqual({ page: 0, pageSize: 10 });
    expect(parseOrdersQuery({ from: '2024-02-29' })).toMatchObject({ from: '2024-02-29' });
    expect(parseOrdersQuery({ to: '2026-11-26' })).toMatchObject({ to: '2026-11-26' });
    expect(parseOrdersQuery({ page: '2', pageSize: '50', state: 'PAGADO', from: '2024-02-29', to: '2025-02-28' }))
      .toEqual({ page: 2, pageSize: 50, state: 'PAGADO', from: '2024-02-29', to: '2025-02-28' });
  });

  it.each([
    [{ customerId: 'another-user' }, 'PARAMETRO_INVALIDO'],
    [{ from: ['2026-11-25', '2026-11-26'] }, 'FORMATO_INVALIDO'],
    [{ from: '2026-02-29' }, 'FORMATO_INVALIDO'],
    [{ from: '2026-13-01' }, 'FORMATO_INVALIDO'],
    [{ from: '2026-00-01' }, 'FORMATO_INVALIDO'],
    [{ from: '0000-01-01' }, 'FORMATO_INVALIDO'],
    [{ from: '2026-07-00' }, 'FORMATO_INVALIDO'],
    [{ from: '2026-6-01' }, 'FORMATO_INVALIDO'],
    [{ state: 'OTRO' }, 'FORMATO_INVALIDO'],
    [{ page: '-1' }, 'PAGINACION_INVALIDA'],
    [{ page: '9007199254740992' }, 'PAGINACION_INVALIDA'],
    [{ pageSize: '0' }, 'PAGINACION_INVALIDA'],
    [{ pageSize: '51' }, 'PAGINACION_INVALIDA'],
    [{ from: '2026-11-26', to: '2026-11-25' }, 'RANGO_FECHAS_INVALIDO'],
    [{ from: '2024-02-29', to: '2025-03-01' }, 'RANGO_FECHAS_INVALIDO'],
  ])('rejects malformed or unauthorized query %j', (query, code) => {
    expect(() => parseOrdersQuery(query)).toThrow(expect.objectContaining({ response: expect.objectContaining({ code }) }));
  });
});
