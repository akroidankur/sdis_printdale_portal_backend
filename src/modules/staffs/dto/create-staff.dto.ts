import { IsString, IsNotEmpty } from 'class-validator';

export class CreateStaffDto {
  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  createdBy: string; // Expect ObjectId as string, convert in service

  @IsString()
  @IsNotEmpty()
  updatedBy: string; // Expect ObjectId as string, convert in service
}
