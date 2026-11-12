import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { FakeMapsProvider } from './fake-maps.provider';
import { GoogleMapsProvider } from './google-maps.provider';
import { MAPS_PROVIDER, type MapsProvider } from './maps.provider';
import { MapsService } from './maps.service';
import { PlacesController } from './places.controller';

@Global()
@Module({
  controllers: [PlacesController],
  providers: [
    {
      provide: MAPS_PROVIDER,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): MapsProvider =>
        c.MAPS_PROVIDER === 'google'
          ? new GoogleMapsProvider(c.GOOGLE_MAPS_API_KEY!)
          : new FakeMapsProvider(),
    },
    MapsService,
  ],
  exports: [MapsService],
})
export class MapsModule {}
