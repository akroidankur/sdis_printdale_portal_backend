import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ collection: 'staffs', timestamps: true })
export class Staff extends Document {
  @Prop({ required: true })
  readonly fullName: string;

  @Prop({ required: true, unique: true })
  readonly employeeId: string;

  @Prop({ required: true })
  readonly password: string;

  @Prop({ required: true })
  readonly post: string;

  @Prop({ required: true })
  readonly department: string;

  @Prop({ type: Types.ObjectId, ref: () => Staff })
  createdBy: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: () => Staff })
  updatedBy: Types.ObjectId;
}

export const StaffSchema = SchemaFactory.createForClass(Staff);