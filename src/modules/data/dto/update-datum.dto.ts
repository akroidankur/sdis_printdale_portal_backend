// src/modules/data/dto/update-datum.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateDatumDto } from './create-datum.dto';

export class UpdateDatumDto extends PartialType(CreateDatumDto) {}