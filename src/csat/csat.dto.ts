import { ArrayMaxSize, ArrayUnique, IsArray, IsIn, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

export class SubmitCsatDto {
  @IsIn(['GOOD', 'REGULAR', 'BAD'])
  sentiment!: 'GOOD' | 'REGULAR' | 'BAD';

  @ValidateIf((_object, value) => value !== undefined) @IsArray() @ArrayMaxSize(10) @ArrayUnique()
  @IsString({ each: true }) @Matches(/^[A-Z][A-Z0-9_]{0,49}$/, { each: true })
  reasons?: string[];

  @ValidateIf((_object, value) => value !== undefined) @IsString() @MaxLength(1000)
  @Matches(/^[^\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]*$/u)
  comment?: string;
}
