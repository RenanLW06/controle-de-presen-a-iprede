import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthedRequest } from '../auth/auth.types';
import { JwtGuard, Roles, RolesGuard } from '../auth/guards';
import { IsDay } from '../common/dto';
import { parseLimit } from '../common/cursor';
import { RoomsService } from './rooms.service';

class CreateRoomDto { @IsString() @MinLength(1) @MaxLength(80) name: string; }
class AssignMonitorDto { @IsUUID() userId: string; @IsOptional() @IsDay() startedOn?: string; }

@Controller('rooms')
@UseGuards(JwtGuard, RolesGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post() @Roles('admin')
  create(@Req() r: AuthedRequest, @Body() d: CreateRoomDto) { return this.rooms.create(r.user, r.id, d.name); }

  @Get() @Roles('admin', 'monitor')   // monitor só enxerga a própria sala (RLS)
  list(@Req() r: AuthedRequest, @Query('limit') l?: string, @Query('cursor') c?: string) {
    return this.rooms.list(r.user, r.id, parseLimit(l), c);
  }

  @Post(':id/monitors') @Roles('admin')
  assign(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AssignMonitorDto) {
    return this.rooms.assignMonitor(r.user, r.id, id, d.userId, d.startedOn);
  }
}
