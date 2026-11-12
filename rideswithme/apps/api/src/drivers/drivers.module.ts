import { Module } from '@nestjs/common';
import { AdminDriversController } from './admin-drivers.controller';
import { AdminDriversService } from './admin-drivers.service';
import { DocumentExpiryService } from './document-expiry.service';
import { DriverController } from './driver.controller';
import { DriverNotifier } from './driver-notifier';
import { DriverOnboardingService } from './driver-onboarding.service';
import { DriverViewService } from './driver-view.service';

@Module({
  controllers: [DriverController, AdminDriversController],
  providers: [
    DriverViewService,
    DriverOnboardingService,
    AdminDriversService,
    DriverNotifier,
    DocumentExpiryService,
  ],
  exports: [DriverViewService],
})
export class DriversModule {}
