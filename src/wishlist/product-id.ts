import { registerDecorator, ValidationOptions } from 'class-validator';
import { Injectable, PipeTransform } from '@nestjs/common';
import { ApiError } from '../http/api-error';

export function isProductId(value: unknown): value is string {
  return typeof value === 'string' && [...value].length >= 1 && [...value].length <= 100
    && value.trim() === value && !/[\u0000-\u001f\u007f-\u009f]/u.test(value);
}

export function IsProductId(options?: ValidationOptions): PropertyDecorator {
  return (target, propertyKey) => registerDecorator({
    name: 'isProductId', target: target.constructor, propertyName: String(propertyKey), options,
    validator: { validate: isProductId, defaultMessage: () => 'Identificador de producto inválido' },
  });
}

@Injectable()
export class ProductIdPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (!isProductId(value)) throw new ApiError(400, 'INVALID_PRODUCT_ID', 'Identificador de producto inválido');
    return value;
  }
}

export class SaveWishlistItemDto {
  @IsProductId()
  productId!: string;
}
