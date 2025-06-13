import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ConfigService } from '../../config/config.service';

interface AuthenticatedRequest extends FastifyRequest {
  user?: any;
}

@Injectable()
export class SignedJwtMiddleware implements NestMiddleware {
  constructor(private readonly configService: ConfigService) {}

  use(req: AuthenticatedRequest, res: FastifyReply, done: (err?: any) => void) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Token missing');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('Token missing');
    }

    const jwtSecret = this.configService.jwtSecret;
    if (!jwtSecret || jwtSecret.trim() === '') {
      throw new Error('JWT_SECRET is not defined or empty in environment variables');
    }

    try {
      req.user = jwt.verify(token, jwtSecret);
      done();
    } catch (error) {
      throw new UnauthorizedException(`Invalid token ${error}`);
    }
  }
}
