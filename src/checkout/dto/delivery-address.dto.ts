import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDeliveryAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(180)
  street!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  district!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  province!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  department!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  reference?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  phone!: string;
}
