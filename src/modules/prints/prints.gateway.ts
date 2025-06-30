import { SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Print } from './entities/print.entity';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: 'print-live-updates',
  cors: true, // Match Linux version
  pingTimeout: 60000,
  pingInterval: 25000,
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