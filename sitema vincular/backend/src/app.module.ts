import { Module } from '@nestjs/common';
import { AttendanceController } from './attendance/attendance.controller';
import { AttendanceService } from './attendance/attendance.service';
import { AuditController } from './audit/audit.controller';
import { AuthModule } from './auth/auth.module';
import { ChildrenController } from './children/children.controller';
import { ChildrenService } from './children/children.service';
import { DbModule } from './db/db.module';
import { ObservationsController } from './observations/observations.controller';
import { ObservationsService } from './observations/observations.service';
import { RoomsController } from './rooms/rooms.controller';
import { RoomsService } from './rooms/rooms.service';

@Module({
  imports: [DbModule, AuthModule],
  controllers: [ChildrenController, RoomsController, AttendanceController, ObservationsController, AuditController],
  providers: [ChildrenService, RoomsService, AttendanceService, ObservationsService],
})
export class AppModule {}
