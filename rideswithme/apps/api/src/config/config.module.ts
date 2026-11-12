import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig, loadConfig } from './config';

@Global()
@Module({})
export class ConfigModule {
  static forRoot(config?: AppConfig): DynamicModule {
    return {
      module: ConfigModule,
      providers: [{ provide: APP_CONFIG, useValue: config ?? loadConfig() }],
      exports: [APP_CONFIG],
    };
  }
}
