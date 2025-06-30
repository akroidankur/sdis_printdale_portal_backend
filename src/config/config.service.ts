import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly configService: NestConfigService) { }

  private getOrThrow(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`❌ ${key} is not defined in environment variables!`);
    }
    return value;
  }

  get port(): number {
    return Number(this.getOrThrow('PORT'));
  }

  get mongoUri(): string {
    return this.getOrThrow('MONGO_URI');
  }

  get corsOriginWebPrinter(): string {
    return this.getOrThrow('WEB_PRINTER');
  }

    get corsOriginWebPrinterAdmin(): string {
    return this.getOrThrow('WEB_PRINTER_ADMIN');
  }

  get corsOriginAppAndroid(): string {
    return this.getOrThrow('APP_PRINTER_ANDROID');
  }

  get corsOriginAppAndroidS(): string {
    return this.getOrThrow('APP_PRINTER_ANDROID_S');
  }

  get corsOriginAppiOS(): string {
    return this.getOrThrow('APP_PRINTER_IOS');
  }

  get jwtSecret(): string {
    return this.getOrThrow('JWT_SECRET');
  }

  get jwtExpiry(): string {
    return this.getOrThrow('JWT_EXPIRY');
  }
}