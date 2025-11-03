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
  cors: (configService: ConfigService) => ({
    origin: [
      configService.corsOriginWebPrinter,
      configService.corsOriginWebPrinterAdmin,
      configService.corsOriginAppAndroid,
      configService.corsOriginAppAndroidS,
      configService.corsOriginAppiOS,
    ],
    methods: ['GET', 'POST'],
    credentials: true,
  }),
})
export class DataGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DataGateway.name);
  private nodemcuClients = new Map<string, Socket>();

  constructor(
    private readonly dataService: DataService,
    private readonly configService: ConfigService,
  ) {}

  afterInit() {
    this.logger.log('WebSocket Gateway Initialized');
    this.logger.log(
      `CORS allowed origins: ${[
        this.configService.corsOriginWebPrinter,
        this.configService.corsOriginWebPrinterAdmin,
        this.configService.corsOriginAppAndroid,
        this.configService.corsOriginAppAndroidS,
        this.configService.corsOriginAppiOS,
      ].join(', ')}`,
    );
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id} from ${client.handshake.headers.origin}`);
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

  @SubscribeMessage('sensorData')
  async handleSensorData(
    @MessageBody() payload: CreateDatumDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    try {
      const deviceId = payload.deviceId;
      if (!deviceId) {
        client.emit('error', { message: 'deviceId is required' });
        return;
      }

      this.logger.debug(`Sensor data from ${client.id} (${deviceId})`);

      const saved = await this.dataService.replaceDatumByDeviceId(payload);
      this.nodemcuClients.set(deviceId, client);
      this.server.emit('newData', saved);

      this.logger.log(`Broadcasted to ${this.server.engine.clientsCount} clients`);
    } catch (err: any) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      this.logger.error('Failed to save data', err.stack);
      client.emit('error', { message: 'Save failed' });
    }
  }

  @SubscribeMessage('togglePump')
  handleTogglePump(
    @MessageBody()
    { pumpType, status, deviceId }: { pumpType: 'harv' | 'irr'; status: boolean; deviceId: string },
    @ConnectedSocket() client: Socket,
  ): void {
    this.logger.log(`${pumpType} pump ${status ? 'ON' : 'OFF'} → ${deviceId}`);

    const esp32 = this.nodemcuClients.get(deviceId);
    if (esp32 && esp32.connected) {
      esp32.emit('pumpCommand', { pumpType, status });
      client.emit('pumpStatus', { success: true, pumpType, status });
    } else {
      client.emit('error', { message: 'Device offline' });
    }
  }
}