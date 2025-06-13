import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, EMPTY } from 'rxjs';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Multipart, MultipartFields } from '@fastify/multipart';
import { BusboyFileStream } from '@fastify/busboy';

interface MultipartFile {
  file: BusboyFileStream;
  filename: string;
  mimetype: string;
  fieldname: string;
  encoding: string;
  type: 'file';
  toBuffer: () => Promise<Buffer>;
  fields: MultipartFields;
}

export interface MulterRequest extends FastifyRequest {
  file: () => Promise<MultipartFile | undefined>;
  multerFile?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
    fieldname: string;
    encoding: string;
  };
  multipartFields?: Record<string, string>;
}

@Injectable()
export class MulterInterceptor implements NestInterceptor {
  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<MulterRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    try {
      const file = await request.file();
      if (!file) {
        reply.status(400).send({ message: 'No file uploaded' });
        return EMPTY;
      }

      // Convert file stream to buffer
      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(Buffer.from(chunk as Buffer<ArrayBufferLike>));
      }
      const buffer = Buffer.concat(chunks);

      // Attach file to request
      request.multerFile = {
        buffer,
        originalname: file.filename,
        mimetype: file.mimetype,
        size: buffer.length,
        fieldname: file.fieldname,
        encoding: file.encoding || '7bit',
      };

      // Parse non-file form fields
      const fields: Record<string, string> = {};
      for (const key in file.fields) {
        if (Object.prototype.hasOwnProperty.call(file.fields, key)) {
          const field = file.fields[key];
          if (Array.isArray(field)) {
            // Handle array of fields (multipart with multiple values for the same key)
            field.forEach((item: Multipart) => {
              if (item.type === 'field' && typeof item.value === 'string') {
                fields[key] = item.value;
              }
            });
          } else if (field && field.type === 'field' && typeof field.value === 'string') {
            // Handle single field
            fields[key] = field.value;
          }
        }
      }
      request.multipartFields = fields;

      return next.handle();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      reply.status(400).send({ message: `File processing error: ${message}` });
      return EMPTY;
    }
  }
}