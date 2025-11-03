import { IsEnum, IsOptional, IsString } from 'class-validator';

export class QueryDataDto {
  @IsString()
  @IsOptional()
  deviceId?: string;

  @IsString()
  @IsOptional()
  createdBy?: string; // ObjectId as string

  @IsString()
  @IsOptional()
  sortBy?: string; // e.g., 'createdAt', 'soilMoisture'

  @IsEnum(['asc', 'desc'])
  @IsOptional()
  sortOrder?: 'asc' | 'desc';

  @IsString()
  @IsOptional()
  page?: string;

  @IsString()
  @IsOptional()
  limit?: string;
}