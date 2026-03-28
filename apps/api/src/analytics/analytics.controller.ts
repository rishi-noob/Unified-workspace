import { Controller, Get, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService, AnalyticsDeptScope } from './analytics.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/types/role.enum';
import { User } from '../users/entities/user.entity';

function analyticsScope(user: User, queryDept?: string): AnalyticsDeptScope {
  if (user.role === UserRole.TEAM_LEAD) {
    const allowed = user.getDepartmentIdArray();
    if (!allowed.length) return { departmentIds: [] };
    if (queryDept) {
      if (!allowed.includes(queryDept)) {
        throw new ForbiddenException('You can only view analytics for your own department(s).');
      }
      return { departmentId: queryDept };
    }
    return { departmentIds: allowed };
  }
  if (queryDept) return { departmentId: queryDept };
  return {};
}

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  @Roles(UserRole.TEAM_LEAD)
  getOverview(@CurrentUser() user: User, @Query('dept') dept?: string) {
    return this.analyticsService.getOverview(analyticsScope(user, dept));
  }

  @Get('volume')
  @Roles(UserRole.TEAM_LEAD)
  getVolume(@CurrentUser() user: User, @Query() query: Record<string, string | undefined>) {
    const { dept, from, to, groupBy } = query;
    return this.analyticsService.getVolume({ from, to, groupBy }, analyticsScope(user, dept));
  }

  @Get('sla')
  @Roles(UserRole.TEAM_LEAD)
  getSla(@CurrentUser() user: User, @Query() query: Record<string, string | undefined>) {
    const { dept, from, to } = query;
    return this.analyticsService.getSla({ from, to }, analyticsScope(user, dept));
  }

  @Get('channels')
  @Roles(UserRole.TEAM_LEAD)
  getChannels(@CurrentUser() user: User, @Query() query: Record<string, string | undefined>) {
    const { dept, from, to } = query;
    return this.analyticsService.getChannelBreakdown({ from, to }, analyticsScope(user, dept));
  }

  @Get('agents')
  @Roles(UserRole.TEAM_LEAD)
  getAgents(@CurrentUser() user: User, @Query() query: Record<string, string | undefined>) {
    const { dept, from, to } = query;
    return this.analyticsService.getAgentStats({ from, to }, analyticsScope(user, dept));
  }

  @Get('export')
  @Roles(UserRole.MANAGER)
  async export(@CurrentUser() user: User, @Query() query: Record<string, string | undefined>) {
    const { dept, from, to } = query;
    const volume = await this.analyticsService.getVolume({ from, to }, analyticsScope(user, dept));
    const csv = ['Date,Ticket Count', ...volume.map(v => `${v.date},${v.count}`)].join('\n');
    return { csv, filename: `analytics_export_${new Date().toISOString().substring(0, 10)}.csv` };
  }
}
