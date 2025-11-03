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

@Injectable()
@WebSocketGateway({
  path: '/socket.io/',
  cors: { origin: '*' },
  transports: ['websocket'],
  pingInterval: 25000,
  pingTimeout: 20000,
})
export class DataGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DataGateway.name);
  private nodemcuClients = new Map<string, Socket>();

  constructor(private readonly dataService: DataService) {}

  afterInit() {
    this.logger.log('WebSocket Gateway Initialized');
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    for (const [deviceId, socket] of this.nodemcuClients.entries()) {
      if (socket.id === client.id) {
        this.nodemcuClients.delete(deviceId);
        this.logger.log(`ESP32 ${deviceId} removed`);
        break;
      }
    }
  }

  // === ESP32 SENDS SENSOR DATA ===
  @SubscribeMessage('sensorData')
  async handleSensorData(
    @MessageBody() payload: CreateDatumDto & { deviceId: string },
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    try {
      const deviceId = payload.deviceId;
      if (!deviceId) {
        client.emit('error', { message: 'deviceId required' });
        return; // ← FIXED: return void
      }

      this.logger.debug(`Sensor data from ${client.id} (${deviceId})`);

      const saved = await this.dataService.replaceDatumByDeviceId(payload);
      this.nodemcuClients.set(deviceId, client);

      this.server.emit('newData', saved); // ← BROADCAST

      this.logger.log(`Broadcasted to ${this.server.engine.clientsCount} clients`);
    } catch (err) {
      this.logger.error('Failed to save data', err); // ← 'error' renamed to 'err'
      client.emit('error', { message: 'Save failed' });
    }
  }

  // === FRONTEND SENDS PUMP COMMAND ===
  @SubscribeMessage('togglePump')
  handleTogglePump(
    @MessageBody() { status, deviceId }: { status: boolean; deviceId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    this.logger.log(`Pump ${status ? 'ON' : 'OFF'} → ${deviceId}`);

    const esp32 = this.nodemcuClients.get(deviceId);
    if (esp32 && esp32.connected) {
      esp32.emit('pumpCommand', { status });
      client.emit('pumpStatus', { success: true, status });
    } else {
      client.emit('error', { message: 'Device offline' });
    }
  }
}