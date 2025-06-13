import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ConfigService } from './config/config.service';
import { APP_CONSTANTS_PROMISE, CORS } from './helper/app.constants';
import { TrackingMiddleware, AuthenticatedRequest } from './tracking.middleware';
import { preValidationHookHandler } from 'fastify';
import multipart from '@fastify/multipart';

async function bootstrap(): Promise<void> {
  try {
    const fastifyAdapter = new FastifyAdapter({ logger: true });
    // Register @fastify/multipart
    fastifyAdapter.getInstance().register(multipart, {
      limits: {
        fileSize: 50 * 1024 * 1024, // 100MB max
        files: 1, // Single file
      },
    });

    const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter);
    const configService = app.get(ConfigService);
    const trackingMiddleware = new TrackingMiddleware(configService);

    fastifyAdapter.getInstance().addHook('preValidation', ((request, reply, done) => {
      trackingMiddleware.use(request as AuthenticatedRequest, reply, done);
    }) as preValidationHookHandler);

    const APP_CONSTANTS: CORS = await APP_CONSTANTS_PROMISE;
    app.enableCors(APP_CONSTANTS.CORS_OPTIONS);

    await app.listen(configService.port, '0.0.0.0');

    console.log(`🚀 Server running on: ${await app.getUrl()}`);
    console.log('📌 NODE_ENV:', process.env.NODE_ENV);
    console.log('📌 WEB_PRINTER:', configService.corsOriginWebPrinter);
    console.log('📌 WEB_PRINTER_ADMIN:', configService.corsOriginWebPrinterAdmin);
    console.log('📌 APP_ANDROID:', configService.corsOriginAppAndroid);
    console.log('📌 APP_ANDROID_S:', configService.corsOriginAppAndroidS);
    console.log('📌 APP_IOS:', configService.corsOriginAppiOS);
    console.log('📌 MONGO_URI:', configService.mongoUri);
    console.log('📌 Using HTTP Adapter:', app.getHttpAdapter().getType());
  } catch (error) {
    console.error('❌ Error starting the server:', error);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  console.error('Unhandled error in bootstrap:', error);
});