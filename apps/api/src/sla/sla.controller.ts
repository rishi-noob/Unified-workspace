import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SlaService } from './sla.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/types/role.enum';

@ApiTags('SLA Policies')
@ApiBearerAuth()
@Controller('api/v1/sla-policies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SlaController {
  constructor(private readonly slaService: SlaService) {}

  @Get()
  @Roles(UserRole.TEAM_LEAD)
  findAll(@Query('dept') dept?: string) {
    return this.slaService.findAll(dept);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  create(@Body() body: { departmentId: string; priority: string; firstResponseHours: number; resolutionHours: number }) {
    return this.slaService.create(body as any);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN)
  update(@Param('id') id: string, @Body() body: any) {
    return this.slaService.update(id, body);
  }
}
