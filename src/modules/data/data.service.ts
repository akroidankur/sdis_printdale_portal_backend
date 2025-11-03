// src/modules/data/data.service.ts
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Datum } from './entities/datum.entity';
import { Model, Types } from 'mongoose';
import { CreateDatumDto } from './dto/create-datum.dto';
import { UpdateDatumDto } from './dto/update-datum.dto';
import { QueryDataDto } from './dto/query-data.dto';

@Injectable()
export class DataService {
  constructor(@InjectModel(Datum.name) public readonly datumModel: Model<Datum>) {}

  // REPLACE ENTIRE DOCUMENT BY deviceId (used by ESP32)
  async replaceDatumByDeviceId(dto: CreateDatumDto): Promise<Datum> {
    try {
      const cleaned = this.cleanStringFields(dto);

      // Validate ObjectIds
      if (!Types.ObjectId.isValid(cleaned.createdBy)) {
        throw new BadRequestException('Invalid createdBy ObjectId');
      }
      if (cleaned.updatedBy && !Types.ObjectId.isValid(cleaned.updatedBy)) {
        throw new BadRequestException('Invalid updatedBy ObjectId');
      }

      const doc = {
        ...cleaned,
        createdBy: new Types.ObjectId(cleaned.createdBy),
        updatedBy: cleaned.updatedBy
          ? new Types.ObjectId(cleaned.updatedBy)
          : new Types.ObjectId(cleaned.createdBy),
      };

      const result = await this.datumModel.findOneAndReplace(
        { deviceId: cleaned.deviceId },
        doc,
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to replace data: ${msg}`);
    }
  }

  // Manual create (REST)
  async createDatum(createDatumDto: CreateDatumDto): Promise<Datum> {
    try {
      const cleanedData = this.cleanStringFields(createDatumDto);
      const datumData = {
        ...cleanedData,
        createdBy: new Types.ObjectId(cleanedData.createdBy),
        updatedBy: cleanedData.updatedBy
          ? new Types.ObjectId(cleanedData.updatedBy)
          : undefined,
      };

      const createdDatum = new this.datumModel(datumData);
      return await createdDatum.save();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to create data: ${msg}`);
    }
  }

  async getAllData(): Promise<Datum[]> {
    try {
      return await this.datumModel.find().sort({ updatedAt: 'desc' }).exec();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to get all data: ${msg}`);
    }
  }

  async getDataByParameters(queryParams: QueryDataDto): Promise<Datum[]> {
    try {
      const query: Record<string, unknown> = {};
      for (const key in queryParams) {
        if (Object.prototype.hasOwnProperty.call(queryParams, key)) {
          let value = queryParams[key as keyof typeof queryParams];
          if (typeof value === 'string') {
            value = value.trim();
            if (key !== 'deviceId') value = value.toLowerCase();
          }
          if (value !== undefined && value !== '') query[key] = value;
        }
      }

      const page = parseInt(queryParams.page as string) || 1;
      const limit = parseInt(queryParams.limit as string) || 10;
      const skip = (page - 1) * limit;
      const sortBy = queryParams.sortBy || 'updatedAt';
      const sortOrder = queryParams.sortOrder === 'asc' ? 1 : -1;

      return await this.datumModel
        .find(query)
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(limit)
        .collation({ locale: 'en', strength: 2 })
        .exec();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to search data: ${msg}`);
    }
  }

  async getDatumById(id: string): Promise<Datum | null> {
    try {
      this.validateId(id);
      const datum = await this.datumModel.findById(id).exec();
      if (!datum) throw new NotFoundException(`Data with ID ${id} not found`);
      return datum;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to get data by ID: ${msg}`);
    }
  }

  async updateDatum(id: string, updateDatumDto: UpdateDatumDto): Promise<Datum | null> {
    try {
      this.validateId(id);
      const cleanedData = this.cleanStringFields(updateDatumDto);
      const updateData: Record<string, unknown> = { ...cleanedData };
      if (cleanedData.updatedBy) {
        updateData.updatedBy = new Types.ObjectId(cleanedData.updatedBy);
      }

      const updatedDatum = await this.datumModel
        .findByIdAndUpdate(id, updateData, { new: true })
        .exec();

      if (!updatedDatum) throw new NotFoundException(`Data with ID ${id} not found`);
      return updatedDatum;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to update data: ${msg}`);
    }
  }

  async deleteDatum(id: string): Promise<Datum | null> {
    try {
      this.validateId(id);
      const deletedDatum = await this.datumModel.findByIdAndDelete(id).exec();
      if (!deletedDatum) throw new NotFoundException(`Data with ID ${id} not found`);
      return deletedDatum;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      throw new InternalServerErrorException(`Failed to delete data: ${msg}`);
    }
  }

  private validateId(id: string): void {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid ID');
    }
  }

  private cleanStringFields<T extends Record<string, any>>(dto: T): T {
    const cleaned: Record<string, unknown> = { ...dto };
    for (const key in cleaned) {
      if (typeof cleaned[key] === 'string') {
        cleaned[key] = (cleaned[key]).trim();
      }
    }
    return cleaned as T;
  }
}