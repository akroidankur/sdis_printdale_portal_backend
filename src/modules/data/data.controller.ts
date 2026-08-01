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
export class DataController {
  constructor(private readonly dataService: DataService) {}

  // ======================================================
  // Manual create (Admin only)
  // ======================================================
  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() createDatumDto: CreateDatumDto): Promise<Datum> {
    return await this.dataService.createDatum(createDatumDto);
  }

  // ======================================================
  // Get all data (latest first)
  // ======================================================
  @Get()
  async findAll(): Promise<Datum[]> {
    return await this.dataService.getAllData();
  }

  // ======================================================
  // Search with filters + pagination
  // ======================================================
  @Get('search')
  @UseGuards(JwtAuthGuard)
  async findByParameters(@Query() queryParams: QueryDataDto): Promise<Datum[]> {
    return await this.dataService.getDataByParameters(queryParams);
  }

  // ======================================================
  // Get single record by MongoDB _id
  // ======================================================
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id') id: string): Promise<Datum | null> {
    return await this.dataService.getDatumById(id);
  }

  // ======================================================
  // Update by _id
  // ======================================================
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id') id: string,
    @Body() updateDatumDto: UpdateDatumDto,
  ): Promise<Datum | null> {
    return await this.dataService.updateDatum(id, updateDatumDto);
  }

  // ======================================================
  // Delete by _id
  // ======================================================
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Param('id') id: string): Promise<Datum | null> {
    return await this.dataService.deleteDatum(id);
  }

  // ======================================================
  // Get latest data of the single ESP32
  // ======================================================
  @Get('device/:deviceId/latest')
  async getLatestByDeviceId(
    @Param('deviceId') deviceId: string,
  ): Promise<Datum | null> {
    if (!deviceId) {
      throw new BadRequestException('deviceId is required');
    }

    return await this.dataService.datumModel
      .findOne({ deviceId })
      .sort({ updatedAt: -1 })
      .exec();
  }

  // ======================================================
  // Get list of device IDs (will normally return only one)
  // ======================================================
  @Get('devices')
  async getActiveDevices(): Promise<string[]> {
    return await this.dataService.datumModel.distinct('deviceId').exec();
  }
}