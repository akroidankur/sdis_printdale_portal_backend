import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsNotEmpty()
  @IsString()
  readonly employeeId: string

  @IsNotEmpty()
  @IsString()
  readonly password: string;
}
