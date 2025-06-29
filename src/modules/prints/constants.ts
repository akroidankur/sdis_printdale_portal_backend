export const UPLOAD_BASE_PATH = 'C:\\Uploads\\Prints';

export const DEFAULT_PRINTER = 'ricoh-m2701	'; // Example Windows printer name

export enum PrintJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ABORTED = 'aborted',
  CANCELED = 'canceled',
  HELD = 'held',
}

export enum ColorMode {
  COLOR = 'color',
  GRAYSCALE = 'grayscale',
}

export enum Sides {
  SINGLE = 'single',
  DOUBLE = 'double',
}

export enum Orientation {
  UPRIGHT = 'upright',
  SIDEWAYS = 'sideways',
}

export enum PageLayout {
  STANDARD = 'standard',
  BOOKLET = 'booklet',
}

export enum Margin {
  NORMAL = 'normal',
  NARROW = 'narrow',
}

export const VALID_FILE_TYPES = [
  'application/pdf',
  'pdf',
  'application/msword',
  'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'xlsx',
] as const;

export type FileType = typeof VALID_FILE_TYPES[number];

export const VALID_PAPER_SIZES = ['A4', 'A3', 'Letter', 'Legal'] as const;

export type PaperSize = typeof VALID_PAPER_SIZES[number];