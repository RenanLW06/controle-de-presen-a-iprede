import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AuthedRequest } from '../auth/auth.types';
import { JwtGuard, Roles, RolesGuard } from '../auth/guards';
import { parseLimit } from '../common/cursor';
import { IsDay } from '../common/dto';
import { ChildrenService } from './children.service';

class CreateChildDto {
  @IsString() @MinLength(2) @MaxLength(160) fullName: string;
  @IsDay() birthDate: string;
  @IsUUID() roomId: string;
  @IsOptional() @IsDay() startedOn?: string;
}
class MoveChildDto {
  @IsUUID() toRoomId: string;
  @IsDay() effectiveDate: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

@Controller('children')
@UseGuards(JwtGuard, RolesGuard)
export class ChildrenController {
  constructor(private readonly children: ChildrenService) {}

  @Get() @Roles('admin', 'monitor')
  list(@Req() r: AuthedRequest, @Query('limit') l?: string, @Query('cursor') c?: string) {
    return this.children.list(r.user, r.id, parseLimit(l), c);
  }

  @Post() @Roles('admin')
  create(@Req() r: AuthedRequest, @Body() d: CreateChildDto) { return this.children.create(r.user, r.id, d); }

  @Post(':id/move') @Roles('admin')
  move(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: MoveChildDto) {
    return this.children.move(r.user, r.id, id, d);
  }

  @Get(':id/movements') @Roles('admin', 'monitor')
  movements(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.children.movements(r.user, r.id, id); }
}
