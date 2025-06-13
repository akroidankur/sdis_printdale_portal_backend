import {
  IsString,
  IsNumber,
  IsBoolean,
  IsNotEmpty,
  IsEnum,
  IsIn,
  Matches,
  IsOptional,
  IsInt,
  Min,
} from 'class-validator';
import {
  Transform,
  Type,
  TransformFnParams,
} from 'class-transformer';

import {
  Sides,
  Orientation,
  PageLayout,
  Margin,
  VALID_PAPER_SIZES,
  VALID_FILE_TYPES,
  getPrinters,
  PaperSize,
} from '../constants';

// Normalizer for enums and constants (paper size, file type, etc.)
const toLower = (val: unknown): string | undefined =>
  typeof val === 'string' ? val.trim().toLowerCase() : undefined;

// Canonical map for paper sizes
const PAPER_SIZE_MAP: Record<string, PaperSize> = {
  a4: 'A4',
  a3: 'A3',
  letter: 'Letter',
  legal: 'Legal',
};

// Main DTO
export class CreatePrintRequestDto {
  @IsString({ message: 'Employee ID must be a string' })
  @IsNotEmpty({ message: 'Employee ID is required' })
  employeeId: string;

  @IsString({ message: 'Employee name must be a string' })
  @IsNotEmpty({ message: 'Employee name is required' })
  employeeName: string;

  @IsString({ message: 'File type must be a string' })
  @IsNotEmpty({ message: 'File type is required' })
  @Transform(({ value }: TransformFnParams) => toLower(value))
  @IsIn(VALID_FILE_TYPES, {
    message:
      'File type must be one of: pdf, application/pdf, doc, docx, xlsx, or their MIME types',
  })
  fileType: string;

  @IsString({ message: 'Printer must be a string' })
  @IsNotEmpty({ message: 'Printer is required' })
  @Transform(({ value }: TransformFnParams) => toLower(value))
  @IsIn(getPrinters(), {
    message: ({ value }) =>
      `Invalid printer: ${value}. Must be one of: ${getPrinters().join(', ')}`,
  })
  printer: string;

  @IsString({ message: 'Paper size must be a string' })
  @IsOptional()
  @Transform(({ value }: TransformFnParams) => {
    const key = toLower(value);
    return PAPER_SIZE_MAP[key || ''] ?? 'A4';
  })
  @IsIn(VALID_PAPER_SIZES, {
    message: 'Paper size must be one of: A4, A3, Letter, Legal',
  })
  paperSize: PaperSize = 'A4';

  @Type(() => Number)
  @IsNumber({}, { message: 'Copies must be a number' })
  @IsNotEmpty({ message: 'Copies is required' })
  copies: number;

  @Type(() => Boolean)
  @IsBoolean({ message: 'isColor must be a boolean' })
  @IsOptional()
  isColor: boolean = false;

  @IsEnum(Sides, {
    message: 'Sides must be one of: single-sided, double-sided',
  })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): Sides | undefined => {
    const key = toLower(value);
    return key === 'single-sided'
      ? Sides.SINGLE
      : key === 'double-sided'
      ? Sides.DOUBLE
      : undefined;
  })
  sides: Sides = Sides.SINGLE;

  @IsEnum(Orientation, {
    message: 'Orientation must be one of: portrait, landscape',
  })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): Orientation | undefined => {
    const key = toLower(value);
    return key === 'portrait'
      ? Orientation.UPRIGHT
      : key === 'landscape'
      ? Orientation.SIDEWAYS
      : undefined;
  })
  orientation: Orientation = Orientation.UPRIGHT;

  @IsEnum(PageLayout, {
    message: 'Page layout must be one of: normal, booklet',
  })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): PageLayout | undefined => {
    const key = toLower(value);
    return key === 'normal'
      ? PageLayout.NORMAL
      : key === 'booklet'
      ? PageLayout.BOOKLET
      : undefined;
  })
  pageLayout: PageLayout = PageLayout.NORMAL;

  @IsEnum(Margin, {
    message: 'Margins must be one of: normal, narrow',
  })
  @IsOptional()
  @Transform(({ value }: TransformFnParams): Margin | undefined => {
    const key = toLower(value);
    return key === 'normal'
      ? Margin.NORMAL
      : key === 'narrow'
      ? Margin.NARROW
      : undefined;
  })
  margins: Margin = Margin.NORMAL;

  @IsString({ message: 'Pages to print must be a string' })
  @IsNotEmpty({ message: 'Pages to print is required' })
  @Matches(/^(?:all|\d+)$/, {
    message: 'Pages to print must be "all" or a positive integer (e.g., "1")',
  })
  pagesToPrint: string;

  @IsOptional()
  @IsInt({ message: 'sheetsFrom must be an integer' })
  @Min(1, { message: 'sheetsFrom must be at least 1' })
  sheetsFrom?: number;

  @IsOptional()
  @IsInt({ message: 'sheetsTo must be an integer' })
  @Min(1, { message: 'sheetsTo must be at least 1' })
  sheetsTo?: number;

  @IsNotEmpty({ message: 'File is required' })
  file?: {
    buffer: Buffer;
    originalname: string;
    mimetype: string;
    size: number;
    fieldname: string;
    encoding: string;
  };
}