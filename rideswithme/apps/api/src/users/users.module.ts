import { Module } from '@nestjs/common';
import { AccessService } from './access.service';
import { MeController } from './me.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [MeController],
  providers: [UsersService, AccessService],
  exports: [UsersService, AccessService],
})
export class UsersModule {}
