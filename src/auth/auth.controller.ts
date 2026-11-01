import { Body, Controller, Get, Header, HttpCode, Optional, Post, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { CookieRequest, CookieResponse, G7SessionService } from './g7-session.service';
import { VerifyOtpDto } from './otp.dto';
import { ApiError } from '../http/api-error';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService, @Optional() private readonly sessions?: G7SessionService) {}

  private real() {
    if (!this.sessions?.enabled()) throw new ApiError(503, 'AUTH_UNAVAILABLE', 'Acceso no disponible en este entorno.');
    return this.sessions;
  }
  private empty(body: unknown) {
    if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
      throw new ApiError(400, 'INVALID_REQUEST', 'No se esperan datos en esta solicitud.');
    }
  }

  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  login(@Body() input: LoginDto, @Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) {
    if (this.sessions?.enabled()) return this.sessions.login(input, request, response);
    return this.auth.login(input);
  }

  @Get('session')
  @Header('Cache-Control', 'no-store, private')
  session(@Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) { return this.real().session(request, response); }

  @Post('otp/solicitar') @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  requestOtp(@Body() body: unknown, @Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) {
    this.empty(body);
    return this.real().otp(request, response);
  }

  @Post('otp/verificar') @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  verifyOtp(@Body() body: VerifyOtpDto, @Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) {
    return this.real().otp(request, response, body.codigo);
  }

  @Post('refresh') @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  refresh(@Body() body: unknown, @Req() request: CookieRequest) { this.empty(body); return this.real().refresh(request); }

  @Post('logout') @HttpCode(200)
  @Header('Cache-Control', 'no-store, private')
  logout(@Body() body: unknown, @Req() request: CookieRequest, @Res({ passthrough: true }) response: CookieResponse) {
    this.empty(body);
    return this.real().logout(request, response);
  }
}
