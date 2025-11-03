// src/modules/data/entities/datum.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'data', timestamps: true })
export class Datum extends Document {
  // === WATER TANKS ===
  @Prop({ required: true })
  harvestorLevel: number;

  @Prop({ required: true })
  irrigatorLevel: number;

  // === SOIL & ENVIRONMENT ===
  @Prop({ required: true })
  soilMoisture: number;

  @Prop({ required: true })
  temperature: number;

  @Prop({ required: true })
  humidity: number;

  // === RAIN & FLAP ===
  @Prop({ required: true })
  rainDetected: boolean;

  @Prop({ required: true })
  flapOpen: boolean;

  // === PUMPS ===
  @Prop({ required: true })
  harvPump: boolean;

  @Prop({ required: true })
  harvPumpSecsLeft: number;

  @Prop({ required: true })
  irrPump: boolean;

  // === SOLAR TRACKER ===
  @Prop({ required: true })
  solarPan: number;

  @Prop({ required: true })
  solarTilt: number;

  // === METADATA ===
  @Prop({ type: Types.ObjectId, ref: 'Staff', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Staff' })
  updatedBy?: Types.ObjectId;

  // === UNIQUE DEVICE ID ===
  @Prop({ required: true, unique: true, index: true })
  deviceId: string;
}

export const DatumSchema = SchemaFactory.createForClass(Datum);