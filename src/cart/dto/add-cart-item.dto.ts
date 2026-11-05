import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class AddCartItemDto {
  @IsOptional()
  @IsString({ message: 'El parámetro sku debe ser una cadena de texto.' })
  @IsNotEmpty({ message: 'El parámetro sku es requerido.' })
  sku?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  productId?: string;

  @IsOptional()
  @IsInt({ message: 'La cantidad debe ser un número entero.' })
  @Min(1, { message: 'La cantidad mínima es 1.' })
  @Max(99, { message: 'La cantidad máxima permitida es 99.' })
  quantity?: number = 1;
}
