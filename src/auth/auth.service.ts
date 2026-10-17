import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './login.dto';

const DEMO_EMAIL = 'demo@inka.test';
const DEMO_PASSWORD = 'Hito3Demo!';
const INVALID_CREDENTIALS =
  'No pudimos iniciar sesión con esos datos. Revisa tu correo y contraseña e inténtalo de nuevo.';

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  login(input: LoginDto): { mode: 'MOCK'; authenticated: false; message: string } {
    if (
      this.config.get<string>('H3_AUTH_MOCK') !== 'true' ||
      this.config.get<string>('NODE_ENV') === 'production'
    ) {
      throw new HttpException(
        {
          code: 'MOCK_NO_DISPONIBLE',
          message: 'La demostración de acceso no está disponible en este entorno.',
        },
        503,
      );
    }

    if (
      input.correo.trim().toLowerCase() !== DEMO_EMAIL ||
      input.contrasena !== DEMO_PASSWORD
    ) {
      throw new HttpException(
        { code: 'CREDENCIALES_INVALIDAS', message: INVALID_CREDENTIALS },
        401,
      );
    }

    // H3 valida el cableado UI/BFF. Nunca crea sesión, cookie ni token.
    return {
      mode: 'MOCK',
      authenticated: false,
      message: 'Validación de ejemplo completada. No se inició una sesión real.',
    };
  }
}
