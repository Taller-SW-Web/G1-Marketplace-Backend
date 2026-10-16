import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { CheckoutContactDto } from './contact.dto';

describe('CheckoutContactDto document types', () => {
  it.each(['DNI', 'RUC', 'CE', 'PASAPORTE'] as const)(
    'accepts the published document type %s',
    (documentType) => {
      const contact = Object.assign(new CheckoutContactDto(), {
        fullName: 'Ana Perez',
        documentType,
        documentNumber: '12345678',
        phone: '999999999',
        email: 'ana@example.test',
      });

      expect(validateSync(contact)).toHaveLength(0);
    },
  );

  it('rejects legacy enum values that are not in the UI contract', () => {
    const contact = Object.assign(new CheckoutContactDto(), {
      fullName: 'Ana Perez',
      documentType: 'PASSPORT',
      documentNumber: '12345678',
      phone: '999999999',
      email: 'ana@example.test',
    });

    expect(validateSync(contact).some((error) => error.property === 'documentType')).toBe(true);
  });
});
