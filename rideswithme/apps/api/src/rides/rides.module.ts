import { Module } from '@nestjs/common';
import { DriversModule } from '../drivers/drivers.module';
import { PricingService } from '../pricing/pricing.service';
import { AdminRidesController } from './admin-rides.controller';
import { DispatcherService } from './dispatcher.service';
import { DriverTripsController } from './driver-trips.controller';
import { PresenceService } from './presence.service';
import { RideViewService } from './ride-view.service';
import { RideService } from './ride.service';
import { RidesController } from './rides.controller';

@Module({
  imports: [DriversModule],
  controllers: [RidesController, DriverTripsController, AdminRidesController],
  providers: [PresenceService, PricingService, RideViewService, RideService, DispatcherService],
  exports: [PricingService, DispatcherService, PresenceService],
})
export class RidesModule {}
