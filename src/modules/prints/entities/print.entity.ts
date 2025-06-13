import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PrintRequestStatus, Sides, Orientation, PageLayout, Margin, ColorMode } from '../constants';

@Schema({ collection: 'prints', timestamps: true })
export class Print extends Document {
  @Prop({ required: true })
  employeeId: string;

  @Prop({ required: true, default: 'ricoh-m2701' })
  printer: string;

  @Prop({ required: true, enum: ['A4', 'A3', 'Letter', 'Legal'], default: 'A4' })
  paperSize: string;

  @Prop({ required: true, default: 1 })
  copies: number;

  @Prop({ required: true, enum: ColorMode, default: ColorMode.GRAYSCALE })
  isColor: ColorMode;

  @Prop({ required: true, enum: Sides, default: Sides.SINGLE })
  sides: Sides;

  @Prop({ required: true, enum: Orientation, default: Orientation.UPRIGHT })
  orientation: Orientation;

  @Prop({ required: true, enum: PageLayout, default: PageLayout.NORMAL })
  pageLayout: PageLayout;

  @Prop({ required: true, enum: Margin, default: Margin.NORMAL })
  margins: Margin;

  @Prop({ required: true, default: 'all' })
  pagesToPrint: string;

  @Prop({ required: true, enum: PrintRequestStatus, default: PrintRequestStatus.PENDING })
  requestStatus: PrintRequestStatus;

  @Prop({ default: null })
  jobId: string;

  @Prop({ default: null })
  jobStatus: string;

  @Prop({ default: null })
  jobStartTime: Date;

  @Prop({ default: null })
  jobEndTime: Date;

  @Prop({ default: null })
  errorMessage: string;

  @Prop({ default: 0 })
  pagesPrinted: number;

  @Prop({ type: Types.ObjectId, ref: 'Staff' })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Staff' })
  updatedBy: Types.ObjectId;
}

export const PrintSchema = SchemaFactory.createForClass(Print);