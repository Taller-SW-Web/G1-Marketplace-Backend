import { Module } from '@nestjs/common';
import { MockIdentityController } from './mock-identity.controller';
import { MockIdentityService } from './mock-identity.service';

@Module({
  controllers: [MockIdentityController],
  providers: [MockIdentityService],
})
export class MockIdentityModule {}
