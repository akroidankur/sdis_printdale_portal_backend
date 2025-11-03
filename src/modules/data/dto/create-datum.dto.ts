// src/modules/data/dto/create-datum.dto.ts
import {
  IsNumber,
  IsBoolean,
  IsString,
  IsOptional,
  IsMongoId,
} from 'class-validator';

export class CreateDatumDto {
  // === WATER TANKS ===
  @IsNumber()
  harvestorLevel: number;

  @IsNumber()
  irrigatorLevel: number;

  // === SOIL & ENVIRONMENT ===
  @IsNumber()
  soilMoisture: number;

  @IsNumber()
  temperature: number;

  @IsNumber()
  humidity: number;

  // === RAIN & FLAP ===
  @IsBoolean()
  rainDetected: boolean;

  @IsBoolean()
  flapOpen: boolean;

  // === PUMPS ===
  @IsBoolean()
  harvPump: boolean;

  @IsNumber()
  harvPumpSecsLeft: number;

  @IsBoolean()
  irrPump: boolean;

  // === SOLAR TRACKER ===
  @IsNumber()
  solarPan: number;

  @IsNumber()
  solarTilt: number;

  // === METADATA ===
  @IsString()
  @IsMongoId({ message: 'createdBy must be a valid MongoDB ObjectId' })
  createdBy: string;

  @IsString()
  @IsOptional()
  @IsMongoId({ message: 'updatedBy must be a valid MongoDB ObjectId' })
  updatedBy?: string;

  // === DEVICE ID ===
  @IsString()
  deviceId: string;
}