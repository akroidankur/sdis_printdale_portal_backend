import { SubscribeMessage, WebSocketGateway, WebSocketServer, WsException } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrintRequestStatus } from './constants';
import { Logger } from '@nestjs/common';

// Extend Socket to include user property from JwtAuthGuard
interface AuthenticatedSocket extends Socket {
  user?: { _id: string; employeeId: string; iat: number; exp: number }; // Adjust based on your JWT payload
}

@WebSocketGateway({ cors: true })
export class PrintsGateway {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('PrintsGateway');

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client connected: ${client.id}`);
    const employeeId = client.handshake.query.employeeId as string;
    if (employeeId) {
      void client.join(employeeId);
      this.logger.log(`Client ${client.id} joined room ${employeeId}`);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitPrintUpdate(update: { print_job_id: string; employeeId: string; requestStatus: PrintRequestStatus; jobId?: string; errorMessage?: string; jobStartTime?: Date; jobEndTime?: Date }) {
    this.logger.log(`Emitting print update to room ${update.employeeId} for print ${update.print_job_id}`);
    this.server.to(update.employeeId).emit('printUpdate', update);
    // Debug: Log connected clients in room
    this.server.in(update.employeeId).fetchSockets().then((sockets) => {
      this.logger.log(`Clients in room ${update.employeeId}: ${sockets.map(s => s.id).join(', ')}`);
    }).catch((err) => {
      this.logger.error(`Error fetching sockets for room ${update.employeeId}: ${err}`);
    });
  }

  @SubscribeMessage('subscribeToPrintUpdates')
  handleSubscribe(client: AuthenticatedSocket, employeeId: string) {
    if (!client.user) {
      throw new WsException('Unauthorized');
    }
    if (employeeId) {
      void client.join(employeeId);
      this.logger.log(`Client ${client.id} subscribed to print updates for ${employeeId}`);
    }
  }
}