import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class ConfigService {
  constructor(private readonly configService: NestConfigService) {}

  /** Throw a clear error if the env var is missing */
  private getOrThrow(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`Missing ${key} is not defined in environment variables!`);
    }
    return value;
  }

  /* ------------------------------------------------------------------ */
  /*  Existing getters – unchanged (except for the new jwtExpiry)      */
  /* ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ */
  /*  NEW: jwtExpiry → **number** (seconds)                           */
  /* ------------------------------------------------------------------ */
  get jwtExpiry(): number {
    const raw = this.getOrThrow('JWT_EXPIRY');

    // Accept plain numbers (e.g. "3600") or strings that can be parsed
    const num = Number(raw);
    if (Number.isNaN(num) || num <= 0) {
      throw new Error(
        `Invalid JWT_EXPIRY: "${raw}". Must be a positive integer (seconds).`,
      );
    }
    return num;
  }
}