import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query, Req, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { AuthedRequest } from '../auth/auth.types';
import { JwtGuard, Roles, RolesGuard } from '../auth/guards';
import { parseLimit } from '../common/cursor';
import { IsDay } from '../common/dto';
import { AttendanceService } from './attendance.service';

class MarkDto {
  @IsUUID() childId: string;
  @IsDay() date: string;
  @IsIn(['present', 'absent']) status: 'present' | 'absent';
  @IsOptional() @IsString() @MaxLength(1000) justification?: string;
}

@Controller()
@UseGuards(JwtGuard, RolesGuard)
export class AttendanceController {
  constructor(private readonly att: AttendanceService) {}

  @Put('attendance') @Roles('admin', 'monitor')
  mark(@Req() r: AuthedRequest, @Body() d: MarkDto) { return this.att.mark(r.user, r.id, d); }

  @Get('rooms/:roomId/roster') @Roles('admin', 'monitor')
  roster(@Req() r: AuthedRequest, @Param('roomId', ParseUUIDPipe) roomId: string, @Query('date') date: string,
         @Query('limit') l?: string, @Query('cursor') c?: string) {
    return this.att.roster(r.user, r.id, roomId, date, parseLimit(l), c);
  }
}
