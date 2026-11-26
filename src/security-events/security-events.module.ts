import { Module } from '@nestjs/common';
import { SecurityUserEventConsumerService } from './security-user-event-consumer.service';
import { SecurityUserEventInboxService } from './security-user-event-inbox.service';

@Module({
  providers: [SecurityUserEventInboxService, SecurityUserEventConsumerService],
  exports: [SecurityUserEventInboxService],
})
export class SecurityEventsModule {}
