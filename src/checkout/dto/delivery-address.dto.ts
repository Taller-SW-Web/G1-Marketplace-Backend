import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class CreateDeliveryAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  label?: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(180)
  street!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  district!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  province!: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(100)
  department!: string;

  @IsOptional()
  @IsString()
  @MaxLength(180)
  reference?: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(40)
  phone!: string;
}
