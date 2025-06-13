import { IsString, IsNotEmpty, Matches, IsEnum, IsBoolean, IsDateString } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsString()
  @IsNotEmpty()
  post: string;

  @IsString()
  @IsNotEmpty()
  department: string;

  @IsString()
  @IsNotEmpty()
  createdBy: string; // Expect ObjectId as string, convert in service

  @IsString()
  @IsNotEmpty()
  updatedBy: string; // Expect ObjectId as string, convert in service
}

function IsOptional(): (target: CreateStaffDto, propertyKey: "password") => void {
  throw new Error('Function not implemented.');
}
