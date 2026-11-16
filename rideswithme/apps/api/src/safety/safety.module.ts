import { Module } from '@nestjs/common';
import { RidesModule } from '../rides/rides.module';
import { IncidentsService } from './incidents.service';
import { RideMessagesService } from './ride-messages.service';
import {
  AdminSafetyController,
  PublicShareController,
  SafetyController,
} from './safety.controller';
import { SosService } from './sos.service';
import { TripShareService } from './trip-share.service';

@Module({
  imports: [RidesModule],
  controllers: [SafetyController, PublicShareController, AdminSafetyController],
  providers: [SosService, TripShareService, RideMessagesService, IncidentsService],
})
export class SafetyModule {}
