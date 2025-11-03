// src/modules/data/entities/datum.entity.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'data', timestamps: true })
export class Datum extends Document {
  @Prop({ required: true })
  waterTank: number;

  @Prop({ required: true })
  irrigationTank: number;

  @Prop({ required: true })
  soilMoisture: number;

  @Prop({ required: true })
  temperature: number;

  @Prop({ required: true })
  humidity: number;

  @Prop({ required: true })
  light: number;

  @Prop({ required: true })
  lidOpen: boolean;

  @Prop({ required: false, default: false })
  pumpStatus: boolean;

  @Prop({ type: Types.ObjectId, ref: 'Staff', required: true })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Staff' })
  updatedBy?: Types.ObjectId;

  // UNIQUE + INDEXED
  @Prop({ required: true, unique: true, index: true })
  deviceId: string;
}

export const DatumSchema = SchemaFactory.createForClass(Datum);