import { SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Print } from './entities/print.entity';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: 'print-live-updates',
  cors: true,
  pingTimeout: 60000, // Wait 60 seconds before disconnecting due to ping timeout
  pingInterval: 25000, // Send a ping every 25 seconds
})
export class PrintsGateway {
  @WebSocketServer()
  server: Server;

  private logger = new Logger('PrintsGateway');

  afterInit() {
    this.logger.log('WebSocket Gateway initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitPrintUpdate(print: Print) {
    // Transform Date fields to ISO strings for the frontend
    const transformedPrint = {
      ...print,
      createdAt: print.createdAt.toISOString(),
      updatedAt: print.updatedAt.toISOString(),
    };

    this.logger.log(`Emitting print update for print ${print._id}`);
    this.server.emit('printUpdate', transformedPrint);
  }

  @SubscribeMessage('subscribeToPrintUpdates')
  handleSubscribe(client: Socket) {
    this.logger.log(`Client ${client.id} subscribed to print updates`);
  }
}