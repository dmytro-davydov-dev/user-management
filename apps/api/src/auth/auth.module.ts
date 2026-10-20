import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordModule } from './password.module';
import { SessionGuard } from './session.guard';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  imports: [PasswordModule],
  controllers: [AuthController, SessionsController],
  providers: [AuthService, SessionsService, { provide: APP_GUARD, useClass: SessionGuard }],
  exports: [SessionsService],
})
export class AuthModule {}
