import { BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export function validationExceptionFactory(errors: ValidationError[]): BadRequestException {
  const fieldNames = new Set<string>();
  const visit = (items: ValidationError[]): void => {
    for (const item of items) {
      fieldNames.add(item.property);
      if (item.children?.length) visit(item.children);
    }
  };
  visit(errors);

  const addressFields = new Set([
    'label', 'street', 'district', 'province', 'department', 'reference',
    'customerId', 'userId',
  ]);
  const contactFields = new Set([
    'fullName', 'documentType', 'documentNumber', 'email', 'contact',
  ]);

  let code = 'REQUEST_VALIDATION_ERROR';
  if ([...fieldNames].some((field) => contactFields.has(field)) ||
      (fieldNames.has('phone') && fieldNames.has('contact'))) {
    code = 'CONTACT_VALIDATION_ERROR';
  } else if (fieldNames.has('simulationConfirmed')) {
    code = 'SIMULATION_NOT_CONFIRMED';
  } else if (fieldNames.has('couponCode')) {
    code = 'INVALID_COUPON_FORMAT';
  } else if (fieldNames.has('cartVersion')) {
    code = 'CART_VERSION_REQUIRED';
  } else if ([...fieldNames].some((field) => addressFields.has(field) || field === 'phone')) {
    code = 'ADDRESS_VALIDATION_ERROR';
  }

  return new BadRequestException({ error: { code, fields: [...fieldNames] } });
}
