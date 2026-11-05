import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { AuthedRequest } from '../auth/auth.types';
import { JwtGuard, Roles, RolesGuard } from '../auth/guards';
import { parseLimit } from '../common/cursor';
import { ObservationsService } from './observations.service';

class AddObservationDto { @IsString() @MinLength(1) @MaxLength(5000) body: string; }

@Controller()
@UseGuards(JwtGuard, RolesGuard)
export class ObservationsController {
  constructor(private readonly obs: ObservationsService) {}

  @Post('children/:id/observations') @Roles('admin', 'monitor')
  add(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Body() d: AddObservationDto) { return this.obs.add(r.user, r.id, id, d.body); }

  @Get('children/:id/observations') @Roles('admin', 'monitor')
  list(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string, @Query('limit') l?: string, @Query('cursor') c?: string) {
    return this.obs.list(r.user, r.id, id, parseLimit(l), c);
  }

  @Delete('observations/:id') @HttpCode(204) @Roles('admin')   // exclusão lógica, só administrador
  remove(@Req() r: AuthedRequest, @Param('id', ParseUUIDPipe) id: string) { return this.obs.remove(r.user, r.id, id); }
}
