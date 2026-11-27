import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsObject,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CheckoutContactDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsIn(['DNI', 'RUC', 'CE', 'PASAPORTE'])
  documentType!: 'DNI' | 'RUC' | 'CE' | 'PASAPORTE';

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(5)
  @MaxLength(24)
  documentNumber!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
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

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  @Matches(/^[A-Z0-9_-]+$/i)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  deliveryRecipient?: string;
}
