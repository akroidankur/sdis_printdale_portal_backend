import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World! Welcome to JNV Kokrajhar. The ultimate ultrafast IoT Server';
  }
}
