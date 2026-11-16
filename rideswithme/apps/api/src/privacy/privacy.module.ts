import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DeletionService } from './deletion.service';
import { PrivacyController } from './privacy.controller';

@Module({
  imports: [AuthModule],
  controllers: [PrivacyController],
  providers: [DeletionService],
  exports: [DeletionService],
})
export class PrivacyModule {}
