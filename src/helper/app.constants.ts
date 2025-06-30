import { FastifyCorsOptions } from '@fastify/cors';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '../config/config.service';
import { AppConfigModule } from '../config/config.module';
import { INestApplicationContext } from '@nestjs/common';

async function createConfigConstants(): Promise<CORS> {
  const app: INestApplicationContext = await NestFactory.createApplicationContext(AppConfigModule);
  const configService: ConfigService = app.get(ConfigService);

  const PORT: number = configService.port;
  const WEB_PRINTER: string = configService.corsOriginWebPrinter;
  const WEB_PRINTER_ADMIN: string = configService.corsOriginWebPrinterAdmin;
  const APP_ANDROID: string = configService.corsOriginAppAndroid;
  const APP_ANDROID_S: string = configService.corsOriginAppAndroidS;
  const APP_IOS: string = configService.corsOriginAppiOS;

  // Explicitly define origin as string[] or true
  const origins = [WEB_PRINTER, WEB_PRINTER_ADMIN, APP_ANDROID, APP_ANDROID_S, APP_IOS].filter((origin): origin is string => !!origin);
  const CORS_OPTIONS: FastifyCorsOptions = {
    origin: origins.length > 0 && !origins.every(o => o === '*') ? origins : true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  };

  await app.close();

  return {
    PORT,
    CORS_OPTIONS,
  };
}

export const APP_CONSTANTS_PROMISE = createConfigConstants();

export interface CORS {
  PORT: number;
  CORS_OPTIONS: FastifyCorsOptions;
}