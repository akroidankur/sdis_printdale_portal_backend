import { Controller, Post, Get, Param, BadRequestException, UseInterceptors, UseGuards, Req, Body } from '@nestjs/common';
import { PrintsService } from './prints.service';
import { CreatePrintRequestDto } from './dto/create-print-request.dto';
import { Print } from './entities/print.entity';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { MulterInterceptor, MulterRequest } from './multer.interceptor';
import { PrintsGateway } from './prints.gateway';
import { PrintRequestStatus } from './constants';
import { Logger } from '@nestjs/common';

interface EmitTestDto {
  employeeId: string;
  print_job_id: string;
  requestStatus: PrintRequestStatus;
  jobId?: string;
  errorMessage?: string;
  jobStartTime?: string; // ISO string from Postman
  jobEndTime?: string;
}

@Controller('prints')
export class PrintsController {
  private readonly logger = new Logger(PrintsController.name);

  constructor(private readonly printsService: PrintsService, private readonly printsGateway: PrintsGateway) {}

  @Post()
  @UseInterceptors(MulterInterceptor)
  async create(@Req() request: MulterRequest): Promise<Print> {
    const file = request.multerFile;
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const body = request.multipartFields || {};
    this.logger.log(`Incoming multipart fields: ${JSON.stringify(body)}`);

    // Create DTO directly from body, relying on DTO transformations
    const dto = plainToClass(CreatePrintRequestDto, {
      ...body,
      file,
    });

    // Validate DTO
    const errors = await validate(dto);
    if (errors.length > 0) {
      const errorMessages = errors.map(e => {
        const constraints = e.constraints ? Object.values(e.constraints).join('; ') : 'Unknown validation error';
        return `Field ${e.property}: ${constraints}`;
      });
      throw new BadRequestException(`Validation failed: ${errorMessages.join(', ')}`);
    }

    return await this.printsService.createPrint(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(): Promise<Print[]> {
    return await this.printsService.getAllPrints();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Print | null> {
    return await this.printsService.getPrintById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('empid/:empId')
  async findByEmployeeId(@Param('empId') empId: string): Promise<Print[]> {
    return await this.printsService.getPrintsByEmployeeId(empId);
  }

  @Post('emit')
  emitViaGateway(@Body() body: EmitTestDto) {
    const { employeeId, print_job_id, requestStatus } = body;

    if (!employeeId || !print_job_id || !requestStatus) {
      throw new BadRequestException('employeeId, print_job_id, and requestStatus are required');
    }

    // Convert ISO strings to Date objects if present
    const jobStartTime = body.jobStartTime ? new Date(body.jobStartTime) : undefined;
    const jobEndTime = body.jobEndTime ? new Date(body.jobEndTime) : undefined;

    this.printsGateway.emitPrintUpdate({
      employeeId,
      print_job_id,
      requestStatus,
      jobId: body.jobId,
      errorMessage: body.jobId,
      jobStartTime,
      jobEndTime,
    });

    return { status: 'emitted via gateway', room: employeeId };
  }
}