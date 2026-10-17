import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  correo!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  contrasena!: string;
}
