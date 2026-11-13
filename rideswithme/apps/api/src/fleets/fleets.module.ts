import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { RidesModule } from '../rides/rides.module';
import {
  AdminFleetsController,
  DriverFleetController,
  FleetPortalController,
} from './fleets.controller';
import { FleetsService } from './fleets.service';

@Module({
  imports: [AdminModule, RidesModule],
  controllers: [AdminFleetsController, FleetPortalController, DriverFleetController],
  providers: [FleetsService],
})
export class FleetsModule {}
