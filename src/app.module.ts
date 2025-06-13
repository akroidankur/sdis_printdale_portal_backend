import { Module } from '@nestjs/common';
import { AppConfigModule } from './config/config.module';
import { MongoModule } from './database/mongo.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { StaffsModule } from './modules/staffs/staffs.module';
import { AuthModule } from './auth/auth.module';
import { PrintsModule } from './modules/prints/prints.module';
@Module({
  imports: [
    AppConfigModule,
    MongoModule,
    StaffsModule,
    AuthModule,
    PrintsModule
  ],
  providers: [AppService],
  controllers: [AppController]
})
export class AppModule { }