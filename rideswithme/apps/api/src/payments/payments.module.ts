import { Module } from '@nestjs/common';
import type Redis from 'ioredis';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { REDIS } from '../redis/redis.module';
import { FakePaymentProvider } from './fake.provider';
import { LedgerService } from './ledger.service';
import { PAYMENT_PROVIDER } from './payment.provider';
import { PaymentsService } from './payments.service';
import { PaystackProvider } from './paystack.provider';
import { RidePaymentsService } from './ride-payments.service';
import { AdminPaymentsController } from './admin-payments.controller';
import { DisputesService } from './disputes.service';
import { PayoutsService } from './payouts.service';
import { ReconcileService } from './reconcile.service';
import { RefundsService } from './refunds.service';
import { DriverWalletController, WalletController } from './wallet.controller';
import { FakeCheckoutController, WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  controllers: [
    WalletController,
    DriverWalletController,
    WebhooksController,
    FakeCheckoutController,
    AdminPaymentsController,
  ],
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [APP_CONFIG, REDIS],
      useFactory: (c: AppConfig, redis: Redis) =>
        c.PAYMENT_PROVIDER === 'paystack'
          ? new PaystackProvider(c.PAYSTACK_SECRET_KEY!, c.PAYSTACK_BASE_URL)
          : new FakePaymentProvider(redis, c.PUBLIC_API_URL),
    },
    LedgerService,
    PaymentsService,
    RidePaymentsService,
    PayoutsService,
    RefundsService,
    DisputesService,
    WebhooksService,
    ReconcileService,
  ],
  exports: [
    PAYMENT_PROVIDER,
    LedgerService,
    PaymentsService,
    RidePaymentsService,
    ReconcileService,
  ],
})
export class PaymentsModule {}
