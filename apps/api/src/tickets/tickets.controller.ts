import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery, ApiOperation } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { AiService } from '../ai/ai.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../common/types/role.enum';
import { User } from '../users/entities/user.entity';

@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('api/v1/tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketsController {
  constructor(
    private readonly ticketsService: TicketsService,
    private readonly aiService: AiService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List tickets with RBAC filtering' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'dept', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'channel', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'q', required: false })
  findAll(
    @CurrentUser() user: User,
    @Query() query: any,
  ) {
    return this.ticketsService.findAll(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create ticket manually' })
  async create(@Body() dto: CreateTicketDto, @CurrentUser() user: User) {
    return this.ticketsService.create(dto, user, this.aiService);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full ticket detail with thread and AI insights' })
  findOne(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ticketsService.findById(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update ticket status, priority, assignee, department' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @CurrentUser() user: User,
  ) {
    return this.ticketsService.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: 'Soft delete ticket (super_admin only)' })
  remove(@Param('id') id: string, @CurrentUser() user: User) {
    return this.ticketsService.softDelete(id, user);
  }

  @Post(':id/notes')
  @ApiOperation({ summary: 'Add internal note (invisible to requester)' })
  addNote(
    @Param('id') ticketId: string,
    @Body('content') content: string,
    @CurrentUser() user: User,
  ) {
    return this.ticketsService.addNote(ticketId, content, user);
  }

  @Get(':id/notes')
  @ApiOperation({ summary: 'Get internal notes for a ticket' })
  getNotes(@Param('id') ticketId: string, @CurrentUser() user: User) {
    return this.ticketsService.getNotes(ticketId, user);
  }

  @Post(':id/reply')
  @ApiOperation({ summary: 'Send reply to requester' })
  reply(
    @Param('id') ticketId: string,
    @Body() dto: ReplyTicketDto,
    @CurrentUser() user: User,
  ) {
    return this.ticketsService.addReply(ticketId, dto, user);
  }

  @Post(':id/assign')
  @Roles(UserRole.TEAM_LEAD)
  @ApiOperation({ summary: 'Assign or reassign ticket' })
  assign(
    @Param('id') ticketId: string,
    @Body() dto: AssignTicketDto,
    @CurrentUser() user: User,
  ) {
    return this.ticketsService.assign(ticketId, dto, user);
  }

  @Post(':id/ai-reply-draft')
  @ApiOperation({ summary: 'Generate AI reply draft on demand' })
  async aiReplyDraft(
    @Param('id') ticketId: string,
    @CurrentUser() user: User,
  ) {
    await this.ticketsService.findById(ticketId, user);
    return this.aiService.generateReplyDraft(ticketId);
  }

  @Get(':id/ai-insights')
  @ApiOperation({ summary: 'Get AI classification insights for a ticket' })
  async aiInsights(@Param('id') ticketId: string, @CurrentUser() user: User) {
    const ticket = await this.ticketsService.findById(ticketId, user);
    return {
      category: ticket.aiCategory,
      sentiment: ticket.aiSentiment,
      confidence: ticket.aiConfidence,
      replyDraft: ticket.aiReplyDraft,
    };
  }

  @Get(':id/kb-suggestions')
  @ApiOperation({ summary: 'Get KB article suggestions (returns empty in MVP)' })
  async kbSuggestions(@Param('id') ticketId: string, @CurrentUser() user: User) {
    await this.ticketsService.findById(ticketId, user);
    return { suggestions: [], message: 'KB not yet populated' };
  }
}
