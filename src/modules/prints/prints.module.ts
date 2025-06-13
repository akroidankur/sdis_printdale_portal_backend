import { Module } from '@nestjs/common';
import { PrintsService } from './prints.service';
import { PrintsController } from './prints.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Print, PrintSchema } from './entities/print.entity';
import { AuthModule } from 'src/auth/auth.module';
import { PrintsGateway } from './prints.gateway';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Print.name, schema: PrintSchema }]),
    AuthModule,
  ],
  controllers: [PrintsController],
  providers: [PrintsService, PrintsGateway],
})
export class PrintsModule {}