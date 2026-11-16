import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { PaymentsModule } from '../payments/payments.module';
import { BookingsService } from './bookings.service';
import { AdminBusController, OperatorController, PassengerBusController } from './buses.controller';
import { CatalogService } from './catalog.service';
import { OperatorsService } from './operators.service';

@Module({
  imports: [AdminModule, PaymentsModule],
  controllers: [PassengerBusController, OperatorController, AdminBusController],
  providers: [OperatorsService, CatalogService, BookingsService],
})
export class BusesModule {}
