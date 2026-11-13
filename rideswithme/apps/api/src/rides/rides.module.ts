import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DriversModule } from '../drivers/drivers.module';
import { RealtimeAuthService } from '../realtime/realtime-auth.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeNotifier } from '../realtime/realtime.notifier';
import { UsersModule } from '../users/users.module';
import { PaymentsModule } from '../payments/payments.module';
import { LocationService } from './location.service';
import { MaintenanceService } from './maintenance.service';
import { DashboardService } from './dashboard.service';
import { TripLocationsService } from './trip-locations.service';
import { PricingService } from '../pricing/pricing.service';
import { AdminRidesController } from './admin-rides.controller';
import { DispatcherService } from './dispatcher.service';
import { DriverTripsController } from './driver-trips.controller';
import { PresenceService } from './presence.service';
import { RideViewService } from './ride-view.service';
import { RideService } from './ride.service';
import { RidesController } from './rides.controller';

@Module({
  imports: [DriversModule, AuthModule, UsersModule, PaymentsModule],
  controllers: [RidesController, DriverTripsController, AdminRidesController],
  providers: [
    PresenceService,
    PricingService,
    RideViewService,
    RideService,
    DispatcherService,
    TripLocationsService,
    LocationService,
    RealtimeNotifier,
    RealtimeAuthService,
    RealtimeGateway,
    MaintenanceService,
    DashboardService,
  ],
  exports: [
    PricingService,
    DispatcherService,
    PresenceService,
    RealtimeGateway,
    MaintenanceService,
  ],
})
export class RidesModule {}
