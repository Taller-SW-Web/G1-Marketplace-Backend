import { parseSecurityUserEvent, SecurityUserEventValidationError } from './security-user-event';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const TIMESTAMP = '2026-11-24T12:30:45.123Z';

function envelope(tipo = 'usuario.creado', datos: Record<string, unknown> = { roles: ['CLIENTE'] }) {
  return {
    eventoId: EVENT_ID,
    tipo,
    version: 1,
    fecha: TIMESTAMP,
    usuarioId: USER_ID,
    datos,
  };
}

describe('parseSecurityUserEvent', () => {
  it('normalizes a valid v1 event and computes a stable payload fingerprint', () => {
    const input = envelope();
    const result = parseSecurityUserEvent(Buffer.from(JSON.stringify(input)), 'usuario.creado');
    expect(result).toMatchObject({ kind: 'known', event: {
      eventId: EVENT_ID,
      eventType: 'usuario.creado',
      version: 1,
      occurredAt: TIMESTAMP,
      userId: USER_ID,
      data: { roles: ['CLIENTE'] },
      payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    } });
    expect(parseSecurityUserEvent(JSON.stringify(input), 'usuario.creado'))
      .toEqual(parseSecurityUserEvent(JSON.stringify({ ...input, datos: { roles: ['CLIENTE'] } }), 'usuario.creado'));
  });

  it.each([
    ['usuario.creado', { roles: ['CLIENTE'] }],
    ['usuario.desactivado', { motivo: 'BAJA_ADMINISTRATIVA' }],
    ['usuario.reactivado', { roles: ['CLIENTE'] }],
    ['usuario.bloqueado', { automatico: true, hasta: null }],
    ['usuario.desbloqueado', { via: 'ADMINISTRADOR' }],
    ['usuario.roles_cambiados', { roles: ['VENDEDOR', 'GESTOR_COMERCIAL'] }],
    ['usuario.atributos_actualizados', { campos: ['correo'] }],
  ])('accepts the v1 payload schema for %s', (tipo, datos) => {
    expect(parseSecurityUserEvent(JSON.stringify(envelope(tipo, datos)), tipo)).toMatchObject({ kind: 'known' });
  });

  it('ignores unknown event types after validating the common envelope', () => {
    expect(parseSecurityUserEvent(JSON.stringify(envelope('usuario.nuevo_evento', {})), 'usuario.nuevo_evento'))
      .toEqual({ kind: 'unknown', eventType: 'usuario.nuevo_evento' });
  });

  it('rejects malformed JSON and a routing-key mismatch with stable error codes', () => {
    expect(() => parseSecurityUserEvent('{', 'usuario.creado')).toThrow(
      new SecurityUserEventValidationError('invalid_json'),
    );
    expect(() => parseSecurityUserEvent(JSON.stringify(envelope()), 'usuario.bloqueado')).toThrow(
      new SecurityUserEventValidationError('event_type_routing_key_mismatch'),
    );
  });

  it.each([
    [{ ...envelope(), version: 2 }, 'unsupported_schema_version'],
    [{ ...envelope(), fecha: '2026-11-24T12:30:45Z' }, 'invalid_event_timestamp'],
    [{ ...envelope(), usuarioId: 'not-a-uuid' }, 'invalid_user_id'],
    [envelope('usuario.creado', { roles: [42] as unknown as string[] }), 'invalid_event_data'],
  ])('rejects invalid/unsupported v1 messages (%s)', (event, reason) => {
    try {
      parseSecurityUserEvent(JSON.stringify(event), String((event as { tipo?: string }).tipo ?? 'usuario.creado'));
      throw new Error('expected validation error');
    } catch (error) {
      expect(error).toBeInstanceOf(SecurityUserEventValidationError);
      expect((error as SecurityUserEventValidationError).reasonCode).toBe(reason);
    }
  });
});
