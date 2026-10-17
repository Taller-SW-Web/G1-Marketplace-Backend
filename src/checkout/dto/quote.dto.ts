import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Min,
} from 'class-validator';

export class CreateQuoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  addressId!: string;

  @IsInt()
  @Min(0)
  cartVersion!: number;
}

export class ApplyBenefitDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  quoteId!: string;

  // Empty or omitted removes the selected coupon and obtains a new base quote.
  @IsOptional()
  @IsString()
  @MaxLength(30)
  couponCode?: string;
}

export class PrepareCheckoutDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  quoteId!: string;

  @IsInt()
  @Min(0)
  cartVersion!: number;

  @IsBoolean()
  simulationConfirmed!: boolean;
}
