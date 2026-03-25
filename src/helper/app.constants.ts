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
  const APP_ANDROID: string = configService.corsOriginAppAndroid;
  const APP_ANDROID_S: string = configService.corsOriginAppAndroidS;
  const APP_IOS: string = configService.corsOriginAppiOS;

  const allowedExactOrigins = [
    WEB_PRINTER,
    APP_ANDROID,
    APP_ANDROID_S,
    APP_IOS,
  ].filter(Boolean);

  const CORS_OPTIONS: FastifyCorsOptions = {
    origin: (origin: string | undefined, callback: (err: Error | null, allow: boolean) => void) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedExactOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Allow any origin that ends with :3000 (any IP/hostname on port 3000)
      if (origin.endsWith(':3000')) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'), false);
    },
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