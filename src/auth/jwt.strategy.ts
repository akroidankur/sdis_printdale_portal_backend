import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from 'src/config/config.service';
import { JwtPayload } from 'src/common/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: configService.jwtSecret,
    });
  }

  validate(payload: unknown): { userId: string; employeeId: string } {
    if (!payload || typeof payload !== 'object' || !('_id' in payload) || !('employeeId' in payload)) {
      throw new UnauthorizedException('Invalid token');
    }

    const { _id, employeeId } = payload as JwtPayload;
    return { userId: _id, employeeId };
  }
}
