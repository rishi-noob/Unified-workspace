import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../common/types/role.enum';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @Roles(UserRole.TEAM_LEAD)
  getOverview(@Query('dept') dept?: string) {
    return this.analyticsService.getOverview(dept);
  }

  @Get('volume')
  @Roles(UserRole.TEAM_LEAD)
  getVolume(@Query() query: any) {
    return this.analyticsService.getVolume(query);
  }

  @Get('sla')
  @Roles(UserRole.TEAM_LEAD)
  getSla(@Query() query: any) {
    return this.analyticsService.getSla(query);
  }

  @Get('channels')
  @Roles(UserRole.TEAM_LEAD)
  getChannels(@Query() query: any) {
    return this.analyticsService.getChannelBreakdown(query);
  }

  @Get('agents')
  @Roles(UserRole.TEAM_LEAD)
  getAgents(@Query() query: any) {
    return this.analyticsService.getAgentStats(query);
  }

  @Get('export')
  @Roles(UserRole.MANAGER)
  async export(@Query() query: any) {
    // CSV export — minimal implementation
    const volume = await this.analyticsService.getVolume(query);
    const csv = ['Date,Ticket Count', ...volume.map(v => `${v.date},${v.count}`)].join('\n');
    return { csv, filename: `analytics_export_${new Date().toISOString().substring(0, 10)}.csv` };
  }
}
