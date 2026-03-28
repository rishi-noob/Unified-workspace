import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: '/tickets',
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  },
})
export class TicketsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TicketsGateway.name);

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];
      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      client.data.user = payload;

      // Join personal room
      client.join(`agent:${payload.sub}`);

      // Join department rooms
      const deptIds: string[] = payload.departmentIds || [];
      for (const deptId of deptIds) {
        client.join(`dept:${deptId}`);
      }

      this.logger.log(`Client connected: ${payload.email} (${payload.role})`);
    } catch (err) {
      this.logger.warn(`WS auth failed: ${err.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join:ticket')
  handleJoinTicket(@ConnectedSocket() client: Socket, @MessageBody() ticketId: string) {
    client.join(`ticket:${ticketId}`);
  }

  @SubscribeMessage('leave:ticket')
  handleLeaveTicket(@ConnectedSocket() client: Socket, @MessageBody() ticketId: string) {
    client.leave(`ticket:${ticketId}`);
  }

  // Emit methods called by other services
  emitTicketCreated(ticket: any, departmentId?: string) {
    if (departmentId) {
      this.server.to(`dept:${departmentId}`).emit('ticket:created', { ticket });
    } else {
      this.server.emit('ticket:created', { ticket });
    }
  }

  emitTicketUpdated(ticketId: string, changes: any, departmentId?: string) {
    this.server.to(`ticket:${ticketId}`).emit('ticket:updated', { ticketId, changes });
    if (departmentId) {
      this.server.to(`dept:${departmentId}`).emit('ticket:updated', { ticketId, changes });
    }
  }

  emitTicketAssigned(ticketId: string, assigneeId: string, assignee: any) {
    this.server.to(`agent:${assigneeId}`).emit('ticket:assigned', { ticketId, assignee });
  }

  emitSlaWarning(ticketId: string, minutesLeft: number, departmentId?: string) {
    const payload = { ticketId, minutesLeft };
    this.server.to(`ticket:${ticketId}`).emit('ticket:sla-warning', payload);
    if (departmentId) {
      this.server.to(`dept:${departmentId}`).emit('ticket:sla-warning', payload);
    }
  }

  emitAiInsightsReady(ticketId: string, category: string, sentiment: string, departmentId?: string) {
    const payload = { ticketId, category, sentiment };
    this.server.to(`ticket:${ticketId}`).emit('ai:insights-ready', payload);
    if (departmentId) {
      this.server.to(`dept:${departmentId}`).emit('ai:insights-ready', payload);
    }
  }
}
