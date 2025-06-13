import { HttpException, HttpStatus, NestMiddleware } from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from './config/config.service';
import { Types } from 'mongoose'; // Add this import for ObjectId
import { JwtPayload } from './common/jwt-payload.interface';
interface RequestBody {
    createdBy?: string | Types.ObjectId; // Update type to allow ObjectId
    updatedBy?: string | Types.ObjectId; // Update type to allow ObjectId
    [key: string]: any;
}
export interface AuthenticatedRequest extends FastifyRequest {
    user?: JwtPayload;
    body: RequestBody;
}
export class TrackingMiddleware implements NestMiddleware {
    private readonly excludedRoutes = ['/auth/login', '/auth/logout'];
    private readonly trackedRoutes: RegExp[] = [
        /^\/staffs(\/[a-zA-Z0-9]+)?\/?$/,
        /^\/prints(\/[a-zA-Z0-9]+)?\/?$/,
    ];
    private readonly jwtSecret: string;
    private readonly IT_ADMIN_ID = '6835ed56604d4e29a09bd6a1';

    constructor(configService: ConfigService) {
        this.jwtSecret = configService.jwtSecret;
    }

    use(req: AuthenticatedRequest, res: FastifyReply, done: (err?: Error) => void): void {
        const url = req.url;
        const method = req.method;

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.length > 7) {
            try {
                req.user = jwt.verify(authHeader.slice(7), this.jwtSecret) as JwtPayload;
            } catch (error) {
                console.error(error);
            }
        }

        const userId = req.user?._id;
        if (method === 'DELETE' && userId && userId !== this.IT_ADMIN_ID) {
            throw new HttpException(
                {
                    statusCode: HttpStatus.FORBIDDEN,
                    error: 'Forbidden',
                    message: 'Only the Admins have permissions to delete resources',
                },
                HttpStatus.FORBIDDEN
            );
        }

        if (this.excludedRoutes.some((path) => url.startsWith(path))) {
            return done();
        }

        if (userId && (method === 'PATCH' || method === 'POST')) {
            const body = req.body || (req.body = {});
            const isTracked = this.trackedRoutes.some((pattern) => pattern.test(url));

            if (method === 'PATCH' && isTracked) {
                body.updatedBy = new Types.ObjectId(userId);
            } else if (method === 'POST' && isTracked) {
                body.createdBy = new Types.ObjectId(userId);
                body.updatedBy = new Types.ObjectId(userId);
            }
        }

        done();
    }
}