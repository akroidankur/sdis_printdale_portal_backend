import { IsString, IsOptional, IsBoolean, IsEnum, IsMongoId } from 'class-validator';

export class QueryStaffDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  employeeId?: string;

  @IsString()
  @IsOptional()
  post?: string;

  @IsString()
  @IsOptional()
  department?: string;

  @IsMongoId()
  @IsOptional()
  createdBy?: string;

  @IsMongoId()
  @IsOptional()
  updatedBy?: string;

  @IsString()
  @IsOptional()
  sortBy?: string; // e.g., 'fullName', 'employeeId', 'createdAt'

  @IsString()
  @IsOptional()
  sortOrder?: 'asc' | 'desc'; // Sorting order

  @IsString()
  @IsOptional()
  page?: string; // Pagination: page number

  @IsString()
  @IsOptional()
  limit?: string; // Pagination: items per page
}