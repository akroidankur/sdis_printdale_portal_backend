// src/modules/data/entities/datum.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'data', timestamps: true })
export class Datum extends Document {
  // === WATER LEVELS (Ultrasonic) ===
  @Prop({ required: true })
  filteredLevel: number; // Distance in cm (Filtered Water Tank)

  @Prop({ required: true })
  rainLevel: number; // Distance in cm (Rain Water Tank)

  // === SENSORS ===
  @Prop({ required: true })
  soilMoisture: number; // ADC value

  @Prop({ required: true })
  ldr: number; // Light sensor ADC value

  // === ACTUATORS ===
  @Prop({ required: true })
  filteredPump: boolean;

  @Prop({ required: true })
  rainPump: boolean;

  @Prop({ required: true })
  irrigationPump: boolean;

  @Prop({ required: true })
  streetLight: boolean;

  // === FUTURE (optional for now) ===
  @Prop({ required: false })
  batteryLevel?: number; // Will be added later from ESP

  // === METADATA ===
  @Prop({ type: Types.ObjectId, ref: 'Staff', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Staff' })
  updatedBy?: Types.ObjectId;

  // === SINGLE DEVICE ===
  @Prop({ required: true, unique: true, index: true })
  deviceId: string; // Always "esp32-hydroloop-01"
}

export const DatumSchema = SchemaFactory.createForClass(Datum);