import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  NotFoundException,
  Query,
} from '@nestjs/common';
import { MockIdentityService } from './mock-identity.service';

@Controller('mock-auth')
export class MockIdentityController {
  constructor(private readonly identity: MockIdentityService) {}

  @Get('jwks')
  @Header('Cache-Control', 'no-store')
  jwks() {
    if (!this.identity.isEnabled()) throw new NotFoundException();
    return this.identity.jwks();
  }

  @Get('token')
  @Header('Cache-Control', 'no-store')
  token(@Query('user') user: string, @Headers('x-mock-auth-secret') secret?: string) {
    if (!this.identity.isEnabled()) throw new NotFoundException();
    if (!this.identity.isAuthorized(secret)) {
      throw new ForbiddenException({ error: { code: 'MOCK_AUTH_FORBIDDEN' } });
    }
    const token = this.identity.issue(user);
    if (!token) {
      throw new BadRequestException({ error: { code: 'UNKNOWN_MOCK_USER', allowed: ['default', 'empty'] } });
    }
    return token;
  }
}
