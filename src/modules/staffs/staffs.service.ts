import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Staff } from './entities/staff.entity';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { QueryStaffDto } from './dto/query-params-staffs.dto';
import { MongoServerError } from 'mongodb';

@Injectable()
export class StaffsService {
  constructor(@InjectModel(Staff.name) private readonly staffModel: Model<Staff>) { }

  async createStaff(createStaffDto: CreateStaffDto): Promise<Staff> {
    try {
      // Clean string fields (assuming cleanStringFields trims/normalizes strings)
      const cleanedData = this.cleanStringFields(createStaffDto);

      // Check for existing staff by employeeId or phone
      const staffExists = await this.checkIfStaffExists(
        cleanedData.employeeId,
        cleanedData.phone,
      );

      if (staffExists) {
        throw new ConflictException(
          'Staff with the provided employeeId or phone already exists',
        );
      }

      // Hash password since it's required
      const hashedPassword = await bcrypt.hash(cleanedData.password, 10);
      cleanedData.password = hashedPassword;

      // Convert string ObjectIds to Types.ObjectId and dob to Date
      const staffData = {
        ...cleanedData,
        createdBy: new Types.ObjectId(cleanedData.createdBy),
        updatedBy: new Types.ObjectId(cleanedData.updatedBy),
        dob: new Date(cleanedData.dob),
      };

      const createdStaff = new this.staffModel(staffData);
      return await createdStaff.save();
    } catch (error: unknown) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new ConflictException('Employee ID or phone number already exists');
      }
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(`Failed to create staff: ${errorMessage}`);
    }
  }

  async checkIfStaffExists(employeeId: string, phone: string): Promise<boolean> {
    const staff = await this.staffModel
      .findOne({ $or: [{ employeeId }, { phone }] })
      .exec();
    return !!staff;
  }

  async getAllStaffs(): Promise<Staff[]> {
    try {
      const allStaffs = await this.staffModel.find().sort({ updatedAt: 'desc' }).exec();
      return allStaffs;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(`Failed to get Staffs: ${errorMessage}`);
    }
  }

  async getStaffByParameters(queryParams: QueryStaffDto): Promise<Staff[] | null> {
    try {
      const query: Record<string, unknown> = {};
      const sensitiveFields = ['phone', 'bloodGroup']; // Fields that shouldn't be lowercased

      for (const key in queryParams) {
        if (Object.prototype.hasOwnProperty.call(queryParams, key)) {
          let value = queryParams[key as keyof typeof queryParams];
          if (typeof value === 'string' && !sensitiveFields.includes(key)) {
            value = value.trim().toLowerCase(); // Trim and lowercase non-sensitive fields
          } else if (typeof value === 'string') {
            value = value.trim(); // Trim only for sensitive fields
          }
          query[key] = value;
        }
      }

      // Handle pagination and sorting
      const page = parseInt(queryParams.page as string) || 1;
      const limit = parseInt(queryParams.limit as string) || 10;
      const skip = (page - 1) * limit;
      const sortBy = queryParams.sortBy || 'updatedAt';
      const sortOrder = queryParams.sortOrder === 'asc' ? 1 : -1;

      return await this.staffModel
        .find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .collation({ locale: 'en', strength: 2 })
        .exec();
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(`Failed to get Staffs: ${errorMessage}`);
    }
  }

  async getStaffById(id: string): Promise<Staff | null> {
    try {
      this.validateId(id);
      const existingStaff = await this.staffModel.findById(id).exec();

      if (!existingStaff) {
        throw new NotFoundException(`Staff with ID ${id} not found`);
      }

      return existingStaff;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(`Failed to get Staff by ID: ${id} ${errorMessage}`);
    }
  }

  async updateStaff(id: string, updateStaffDto: UpdateStaffDto): Promise<Staff | null> {
    try {
      this.validateId(id);
      const cleanedData = this.cleanStringFields(updateStaffDto);

      // Prepare update data
      const updateData: Record<string, unknown> = { ...cleanedData };

      // Hash password if provided
      if (cleanedData.password) {
        updateData.password = await bcrypt.hash(cleanedData.password, 10);
      }

      // Convert updatedBy to Types.ObjectId if provided
      if (cleanedData.updatedBy) {
        updateData.updatedBy = new Types.ObjectId(cleanedData.updatedBy);
      }

      const existingStaff = await this.staffModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .exec();

      if (!existingStaff) {
        throw new NotFoundException(`Staff with ID ${id} not found`);
      }

      return existingStaff;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(`Failed to update Staff: ${errorMessage}`);
    }
  }

  async deleteStaff(id: string): Promise<Staff | null> {
    try {
      this.validateId(id);

      const deletedStaff = await this.staffModel.findByIdAndDelete(id).exec();
      if (!deletedStaff) {
        throw new NotFoundException(`Staff with ID ${id} not found`);
      }

      return deletedStaff;
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred';
      throw new InternalServerErrorException(`Failed to delete staff: ${errorMessage}`);
    }
  }

  private validateId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID');
    }
  }

  private cleanStringFields<T extends Record<string, any>>(dto: T): T {
    const cleanedData: Record<string, unknown> = { ...dto };

    for (const key in cleanedData) {
      if (typeof cleanedData[key] === 'string') {
        cleanedData[key] = cleanedData[key].trim();
      }
    }

    return cleanedData as T;
  }
}