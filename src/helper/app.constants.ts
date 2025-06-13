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
  const WEB_PRINTER_ADMIN: string = configService.corsOriginWebPrinter;
  const APP_ANDROID: string = configService.corsOriginAppAndroid;
  const APP_ANDROID_S: string = configService.corsOriginAppAndroidS;
  const APP_IOS: string = configService.corsOriginAppiOS;

  const CORS_OPTIONS: FastifyCorsOptions = {
    origin: [WEB_PRINTER, WEB_PRINTER_ADMIN, APP_ANDROID, APP_ANDROID_S, APP_IOS],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  } as const;

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