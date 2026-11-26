import { Equals, IsBoolean, IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegistrationDto {
  @IsEmail() @MaxLength(254) correo!: string;
  @IsString() @MinLength(1) @MaxLength(256) contrasena!: string;
  @IsString() @MaxLength(100) @Matches(/\S/) nombres!: string;
  @IsString() @MaxLength(100) @Matches(/\S/) apellidos!: string;
  @IsString() @Matches(/^\+51[0-9]{9}$/) celular!: string;
  @IsBoolean() @Equals(true) aceptaTerminos!: boolean;
}
export class RecoveryDto {
  @IsEmail() @MaxLength(254) correo!: string;
}
export class ResetPasswordDto {
  @IsString() @MinLength(1) @MaxLength(2048) token!: string;
  @IsString() @MinLength(1) @MaxLength(256) nuevaContrasena!: string;
}
