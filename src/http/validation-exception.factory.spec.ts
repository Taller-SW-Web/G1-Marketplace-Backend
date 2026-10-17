import { ValidationError } from 'class-validator';
import { validationExceptionFactory } from './validation-exception.factory';

const error = (property: string, children: ValidationError[] = []): ValidationError => ({
  property,
  children,
});

describe('validationExceptionFactory', () => {
  it('classifies a nested contact phone error as CONTACT_VALIDATION_ERROR', () => {
    const exception = validationExceptionFactory([error('contact', [error('phone')])]);

    expect(exception.getResponse()).toMatchObject({
      error: { code: 'CONTACT_VALIDATION_ERROR', fields: ['contact', 'phone'] },
    });
  });

  it('keeps a delivery-address phone error as ADDRESS_VALIDATION_ERROR', () => {
    const exception = validationExceptionFactory([error('phone')]);

    expect(exception.getResponse()).toMatchObject({
      error: { code: 'ADDRESS_VALIDATION_ERROR', fields: ['phone'] },
    });
  });

  it.each([
    ['simulationConfirmed', 'SIMULATION_NOT_CONFIRMED'],
    ['couponCode', 'INVALID_COUPON_FORMAT'],
  ])('maps %s validation to %s', (field, code) => {
    const exception = validationExceptionFactory([error(field)]);

    expect(exception.getResponse()).toMatchObject({ error: { code } });
  });
});
