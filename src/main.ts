import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { APP_CONSTANTS_PROMISE, CORS } from './helper/app.constants';
import { TrackingMiddleware, AuthenticatedRequest } from './tracking.middleware';
import { preValidationHookHandler } from 'fastify';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Logger } from '@nestjs/common';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  try {
    const fastifyAdapter = new FastifyAdapter({ logger: true });
    // Register @fastify/multipart
    await fastifyAdapter.getInstance().register(multipart, {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max
        files: 1, // Single file
      },
    });

    // Register @fastify/cors for HTTP requests
    const APP_CONSTANTS: CORS = await APP_CONSTANTS_PROMISE;
    await fastifyAdapter.getInstance().register(cors, {
      origin: APP_CONSTANTS.CORS_OPTIONS.origin,
      methods: APP_CONSTANTS.CORS_OPTIONS.methods,
      allowedHeaders: APP_CONSTANTS.CORS_OPTIONS.allowedHeaders,
      credentials: APP_CONSTANTS.CORS_OPTIONS.credentials,
    });

    const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter);
    const configService = app.get(ConfigService);
    const trackingMiddleware = new TrackingMiddleware(configService);

    fastifyAdapter.getInstance().addHook('preValidation', ((request, reply, done) => {
      trackingMiddleware.use(request as AuthenticatedRequest, reply, done);
    }) as preValidationHookHandler);

    // Configure Socket.IO with CORS
    app.useWebSocketAdapter(
      new IoAdapter(app),
    );

    await app.listen(configService.port, '0.0.0.0');

    logger.log(`🚀 Server running on: ${await app.getUrl()}`);
    logger.log(`📌 NODE_ENV: ${process.env.NODE_ENV}`);
    logger.log(`📌 CORS Origins: ${Array.isArray(APP_CONSTANTS.CORS_OPTIONS.origin) ? APP_CONSTANTS.CORS_OPTIONS.origin.join(', ') : 'all'}`);
    logger.log(`📌 WEB_PRINTER: ${configService.corsOriginWebPrinter}`);
    logger.log(`📌 WEB_PRINTER_ADMIN: ${configService.corsOriginWebPrinterAdmin}`);
    logger.log(`📌 APP_ANDROID: ${configService.corsOriginAppAndroid}`);
    logger.log(`📌 APP_ANDROID_S: ${configService.corsOriginAppAndroidS}`);
    logger.log(`📌 APP_IOS: ${configService.corsOriginAppiOS}`);
    logger.log(`📌 MONGO_URI: ${configService.mongoUri}`);
    logger.log(`📌 Using HTTP Adapter: ${app.getHttpAdapter().getType()}`);
  } catch (error) {
    logger.error(`❌ Error starting the server: ${error}`);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  console.error('Unhandled error in bootstrap:', error);
});