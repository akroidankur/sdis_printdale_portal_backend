import { Controller, Get, Post, Body, Param, Delete, Query, Patch, UseGuards } from '@nestjs/common';
import { StaffsService } from './staffs.service';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { QueryStaffDto } from './dto/query-params-staffs.dto';
import { Staff } from './entities/staff.entity';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';

@Controller('staffs')
export class StaffsController {
  constructor(private readonly staffsService: StaffsService) { }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() createStaffDto: CreateStaffDto): Promise<Staff> {
    return await this.staffsService.createStaff(createStaffDto);
  }

  @Get()
  async findAll(): Promise<Staff[]> {
    return await this.staffsService.getAllStaffs();
  }

  @UseGuards(JwtAuthGuard)
  @Get('search')
  async findByParameters(@Query() queryParams: QueryStaffDto): Promise<Staff[] | null> {
    return await this.staffsService.getStaffByParameters(queryParams);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Staff | null> {
    return await this.staffsService.getStaffById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateStaffDto: UpdateStaffDto): Promise<Staff | null> {
    return await this.staffsService.updateStaff(id, updateStaffDto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<Staff | null> {
    return await this.staffsService.deleteStaff(id);
  }
}
