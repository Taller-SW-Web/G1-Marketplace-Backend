import { IsInt, Max, Min } from 'class-validator';

export class UpdateCartItemQuantityDto {
  @IsInt({ message: 'La cantidad debe ser un número entero.' })
  @Min(1, { message: 'La cantidad mínima es 1. La cantidad 0 no es válida.' })
  @Max(99, { message: 'La cantidad máxima permitida es 99.' })
  quantity!: number;
}
