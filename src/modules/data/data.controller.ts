// src/modules/data/data.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Query,
  Patch,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { DataService } from './data.service';
import { CreateDatumDto } from './dto/create-datum.dto';
import { UpdateDatumDto } from './dto/update-datum.dto';
import { QueryDataDto } from './dto/query-data.dto';
import { Datum } from './entities/datum.entity';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('data')
@UseGuards(JwtAuthGuard) // All endpoints require JWT
export class DataController {
  constructor(private readonly dataService: DataService) {}

  // POST: Manual data entry (admin use)
  @Post()
  async create(@Body() createDatumDto: CreateDatumDto): Promise<Datum> {
    return await this.dataService.createDatum(createDatumDto);
  }

  // GET: All latest data (one per device)
  @Get()
  async findAll(): Promise<Datum[]> {
    return await this.dataService.getAllData();
  }

  // GET: Search with filters (deviceId, createdBy, sort, pagination)
  @Get('search')
  async findByParameters(@Query() queryParams: QueryDataDto): Promise<Datum[]> {
    return await this.dataService.getDataByParameters(queryParams);
  }

  // GET: Single datum by MongoDB _id
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Datum | null> {
    return await this.dataService.getDatumById(id);
  }

  // PATCH: Update existing datum by _id
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateDatumDto: UpdateDatumDto,
  ): Promise<Datum | null> {
    return await this.dataService.updateDatum(id, updateDatumDto);
  }

  // DELETE: Remove datum by _id
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Datum | null> {
    return await this.dataService.deleteDatum(id);
  }

  // GET: Latest data for a specific device (dashboard use)
  @Get('device/:deviceId/latest')
  async getLatestByDeviceId(@Param('deviceId') deviceId: string): Promise<Datum | null> {
    if (!deviceId) {
      throw new BadRequestException('deviceId is required');
    }
    return await this.dataService.datumModel
      .findOne({ deviceId })
      .sort({ updatedAt: -1 })
      .exec();
  }

  // GET: List of all active device IDs
  @Get('devices')
  async getActiveDevices(): Promise<string[]> {
    return await this.dataService.datumModel.distinct('deviceId').exec();
  }
}