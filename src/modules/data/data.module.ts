// src/modules/data/data.module.ts
import { Module } from '@nestjs/common';
import { DataService } from './data.service';
import { DataController } from './data.controller';
import { DataGateway } from './data.gateway';
import { MongooseModule } from '@nestjs/mongoose';
import { Datum, DatumSchema } from './entities/datum.entity';
import { AuthModule } from 'src/auth/auth.module';
import { AppConfigModule } from 'src/config/config.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Datum.name, schema: DatumSchema },
    ]),
    AuthModule,
    AppConfigModule,
  ],
  controllers: [DataController],
  providers: [DataService, DataGateway],
  exports: [DataService],
})
export class DataModule {}