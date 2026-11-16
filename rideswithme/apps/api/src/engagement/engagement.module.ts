import { Module } from '@nestjs/common';
import { AdminEngagementController, EngagementController } from './engagement.controller';
import { RatingsService } from './ratings.service';
import { SupportService } from './support.service';

@Module({
  controllers: [EngagementController, AdminEngagementController],
  providers: [RatingsService, SupportService],
})
export class EngagementModule {}
