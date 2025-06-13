import { IsString, IsNotEmpty } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @IsNotEmpty()
  password: string;

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
