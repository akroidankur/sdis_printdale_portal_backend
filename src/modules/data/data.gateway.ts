// src/modules/data/data.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { DataService } from './data.service';
import { CreateDatumDto } from './dto/create-datum.dto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from 'src/config/config.service';

@Injectable()
@WebSocketGateway({
  path: '/socket.io/',
  transports: ['websocket'],
  pingInterval: 25000,
  pingTimeout: 20000,
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class DataGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DataGateway.name);

  // Single ESP32 socket (optional reference)
  private esp32Socket: Socket | null = null;

  constructor(
    private readonly dataService: DataService,
    private readonly configService: ConfigService,
  ) {}

  afterInit(_server: Server) {
    this.logger.log('Hydroloop WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    const origin = client.handshake.headers.origin || 'unknown';
    this.logger.log(`Client connected: ${client.id} (origin: ${origin})`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    if (this.esp32Socket?.id === client.id) {
      this.esp32Socket = null;
      this.logger.log('ESP32 disconnected');
    }
  }

  // ======================================================
  // Main event from ESP32
  // ======================================================
  @SubscribeMessage('sensorData')
  async handleSensorData(
    @MessageBody() payload: CreateDatumDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    try {
      if (!payload.deviceId) {
        client.emit('error', { message: 'deviceId is required' });
        return;
      }

      this.logger.debug(`Sensor data received from ${payload.deviceId}`);

      // Save / Replace the single document
      const saved = await this.dataService.replaceDatumByDeviceId(payload);

      // Keep reference of the ESP32 socket
      this.esp32Socket = client;

      // Broadcast to all connected frontend clients
      this.server.emit('newData', saved);

      this.logger.log(
        `Data saved & broadcasted → Clients: ${this.server.engine.clientsCount}`,
      );
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Failed to save sensor data', error.stack);
      client.emit('error', { message: 'Save failed' });
    }
  }
}