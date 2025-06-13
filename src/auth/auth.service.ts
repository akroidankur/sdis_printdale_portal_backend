import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { Staff } from 'src/modules/staffs/entities/staff.entity';
import { User } from './dto/user.interface';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Staff.name) private readonly staffModel: Model<Staff>,
    private readonly jwtService: JwtService
  ) { }

  async validateUser(loginDto: LoginDto): Promise<{ user: User; token: string }> {
    const { employeeId, password } = loginDto;

    const user = await this.staffModel.findOne({ employeeId }).exec();

    if (!user || !(await bcrypt.compare(password, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: { _id: string; employeeId: string } = { _id: String(user._id), employeeId: user.employeeId };
    const token = this.jwtService.sign(payload);

    return {
      user: {
        _id: String(user._id),
        fullName: user.fullName,
        employeeId: user.employeeId,
        post: user.post,
        department: user.department,
      },
      token,
    };
  }
}
