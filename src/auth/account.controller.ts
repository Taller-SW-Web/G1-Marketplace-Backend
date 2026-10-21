import { Body, Controller, Get, Header, HttpCode, Post, Req } from '@nestjs/common';
import { AccountService } from './account.service';
import { RecoveryDto, RegistrationDto, ResetPasswordDto } from './account.dto';
import { CookieRequest } from './g7-session.service';

@Controller('api/v1')
export class AccountController {
  constructor(private readonly account: AccountService) {}
  @Get('auth/capabilities') @Header('Cache-Control', 'no-store, private')
  capabilities() { return this.account.capabilities(); }
  @Get('password/politica') @Header('Cache-Control', 'no-store, private')
  policy() { return this.account.policy(); }
  @Post('auth/registro') @HttpCode(201) @Header('Cache-Control', 'no-store, private')
  register(@Body() input: RegistrationDto, @Req() request: CookieRequest) { return this.account.register(input, request); }
  @Post('password/recuperar') @HttpCode(202) @Header('Cache-Control', 'no-store, private')
  recover(@Body() input: RecoveryDto, @Req() request: CookieRequest) { return this.account.recover(input, request); }
  @Post('password/restablecer') @HttpCode(204) @Header('Cache-Control', 'no-store, private')
  reset(@Body() input: ResetPasswordDto, @Req() request: CookieRequest) { return this.account.reset(input, request); }
}
