import { Global, Module } from '@nestjs/common';
import { SecurityUserEventConsumerService } from './security-user-event-consumer.service';
import { SecurityUserEventInboxService } from './security-user-event-inbox.service';
import { SecurityUserReactionService } from './security-user-reaction.service';

@Global()
@Module({
  providers: [
    SecurityUserEventInboxService,
    SecurityUserReactionService,
    SecurityUserEventConsumerService,
  ],
  exports: [SecurityUserEventInboxService, SecurityUserReactionService],
})
export class SecurityEventsModule {}
