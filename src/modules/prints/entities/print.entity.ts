import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import { ColorMode, Sides, Orientation, PageLayout, Margin, PaperSize, VALID_PAPER_SIZES, PrintJobStatus } from '../constants';

@Schema({ timestamps: true })
export class Print extends Document {
  _id: string;

  @Prop({ required: true })
  employeeId: string;

  @Prop({ required: true })
  employeeName: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  fileType: string;

  @Prop({ required: true })
  printer: string;

  @Prop({ required: true, enum: VALID_PAPER_SIZES })
  paperSize: PaperSize;

  @Prop({ required: true, min: 1 })
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

  @Prop({ required: true, enum: PrintJobStatus, default: PrintJobStatus.PENDING })
  requestStatus: PrintJobStatus;

  @Prop({ default: 0 })
  pagesPrinted: number;

  @Prop({ default: 0 })
  pages: number;

  @Prop()
  jobId?: string;

  @Prop()
  jobStartTime?: string;

  @Prop()
  jobEndTime?: string;

  @Prop()
  errorMessage?: string;

  @Prop({ required: true })
  createdBy: string;

  @Prop({ required: true })
  updatedBy: string;

  createdAt: Date;
  updatedAt: Date;
}

export type PrintDocument = Print & Document;
export const PrintSchema = SchemaFactory.createForClass(Print);