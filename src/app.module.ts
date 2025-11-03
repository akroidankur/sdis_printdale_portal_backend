import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { MongoModule } from './database/mongo.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StaffsModule } from './modules/staffs/staffs.module';
import { AuthModule } from './auth/auth.module';
import { DataModule } from './modules/data/data.module';
@Module({
  imports: [
    AppConfigModule,
    MongoModule,
    StaffsModule,
    AuthModule,
    DataModule,
  ],
  providers: [AppService],
  controllers: [AppController]
})
export class AppModule { }