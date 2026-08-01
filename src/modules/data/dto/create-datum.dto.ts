// src/modules/data/dto/create-datum.dto.ts
import {
  IsNumber,
  IsBoolean,
  IsString,
  IsOptional,
  IsMongoId,
} from 'class-validator';

export class CreateDatumDto {
  // === WATER LEVELS ===
  @IsNumber()
  filteredLevel: number;

  @IsNumber()
  rainLevel: number;

  // === SENSORS ===
  @IsNumber()
  soilMoisture: number;

  @IsNumber()
  ldr: number;

  // === ACTUATORS ===
  @IsBoolean()
  filteredPump: boolean;

  @IsBoolean()
  rainPump: boolean;

  @IsBoolean()
  irrigationPump: boolean;

  @IsBoolean()
  streetLight: boolean;

  // === FUTURE ===
  @IsNumber()
  @IsOptional()
  batteryLevel?: number;

  // === METADATA ===
  @IsString()
  @IsMongoId({ message: 'createdBy must be a valid MongoDB ObjectId' })
  createdBy: string;

  @IsString()
  @IsOptional()
  @IsMongoId({ message: 'updatedBy must be a valid MongoDB ObjectId' })
  updatedBy?: string;

  // === DEVICE ===
  @IsString()
  deviceId: string;
}