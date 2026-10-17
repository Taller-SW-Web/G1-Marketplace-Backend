import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class OrdersQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  page = 0;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize = 10;
}
