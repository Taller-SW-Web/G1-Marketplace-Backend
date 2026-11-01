import { IsString, Matches } from 'class-validator';
export class VerifyOtpDto {
  @IsString()
  @Matches(/^\d{6}$/)
  codigo!: string;
}
