import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsObject,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CheckoutContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsIn(['DNI', 'RUC', 'CE', 'PASAPORTE'])
  documentType!: 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';

  @IsString()
  @MinLength(5)
  @MaxLength(24)
  documentNumber!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(40)
  phone!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class CreateOrderRequestDto {
  @IsUUID()
  checkoutOperationId!: string;

  @IsObject()
  @ValidateNested()
  @Type(() => CheckoutContactDto)
  contact!: CheckoutContactDto;
}
