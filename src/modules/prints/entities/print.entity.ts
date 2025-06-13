import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ColorMode, Sides, Orientation, PageLayout, Margin, PrintRequestStatus } from '../constants';

@Schema({ timestamps: true })
export class Print extends Document {
  _id: string; // Explicitly type _id as string

  @Prop({ required: true })
  employeeId: string;

  @Prop({ required: true })
  employeeName: string;

  @Prop()
  fileName?: string;

  @Prop({ required: true })
  printer: string;

  @Prop({ required: true })
  paperSize: string;

  @Prop({ required: true })
  copies: number;

  @Prop({ required: true, enum: ColorMode })
  isColor: ColorMode;

  @Prop({ required: true, enum: Sides })
  sides: Sides;

  @Prop({ required: true, enum: Orientation })
  orientation: Orientation;

  @Prop({ required: true, enum: PageLayout })
  pageLayout: PageLayout;

  @Prop({ required: true, enum: Margin })
  margins: Margin;

  @Prop({ required: true })
  pagesToPrint: string;

  @Prop({ required: true, enum: PrintRequestStatus, default: PrintRequestStatus.PENDING })
  requestStatus: PrintRequestStatus;

  @Prop()
  jobId?: string;

  @Prop()
  jobStartTime?: string;

  @Prop()
  jobEndTime?: string;

  @Prop()
  errorMessage?: string;

  @Prop({ required: true, default: 0 })
  pagesPrinted: number;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ required: true })
  updatedBy: string;

  createdAt: Date;
  updatedAt: Date;
}

export const PrintSchema = SchemaFactory.createForClass(Print);