import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AdminKycController, KycController } from './kyc.controller';
import { KycService } from './kyc.service';

/** Global so ride and bus booking can check a passenger is verified. */
@Global()
@Module({
  imports: [AuthModule],
  controllers: [KycController, AdminKycController],
  providers: [KycService],
  exports: [KycService],
})
export class PassengersModule {}
