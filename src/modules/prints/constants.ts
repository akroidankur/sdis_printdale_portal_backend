export enum PrintRequestStatus {
  PENDING = 'pending',
  SENT_TO_PRINTER = 'sent-to-printer',
  FAILED = 'failed',
  COMPLETED = 'completed',
}

export enum PrintJobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  ABORTED = 'aborted',
  CANCELED = 'canceled',
  HELD = 'held',
}

export enum Sides {
  SINGLE = 'single-sided',
  DOUBLE = 'double-sided',
}

export enum Orientation {
  UPRIGHT = 'portrait',
  SIDEWAYS = 'landscape',
}

export enum PageLayout {
  NORMAL = 'normal',
  BOOKLET = 'booklet',
}

export enum Margin {
  NORMAL = 'normal',
  NARROW = 'narrow',
}

export enum ColorMode {
  GRAYSCALE = 'grayscale',
  COLOR = 'color',
}

export const VALID_PAPER_SIZES = ['A4', 'A3', 'Letter', 'Legal'] as const;
export type PaperSize = typeof VALID_PAPER_SIZES[number];

export const VALID_FILE_TYPES = [
  'pdf',
  'application/pdf',
  'doc',
  'application/msword',
  'docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xlsx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;
export type FileType = typeof VALID_FILE_TYPES[number];

export const COLLATION_DEFAULT = 'collated';
export const CUPS_SERVER_IP = '192.168.1.188';
export const PRINTER_IP = '192.168.1.13';
export const DEFAULT_PRINTER = 'ricoh-m2701';
export const UPLOAD_BASE_PATH = '/home/akroid/print_uploads';
export const CUPS_ADMIN_USERNAME = process.env.CUPS_ADMIN_USERNAME || 'admin';
export const CUPS_ADMIN_PASSWORD = process.env.CUPS_ADMIN_PASSWORD || '';

export function getPrinters(): string[] {
  const printers = process.env.PRINTERS?.split(',').map(p => p.trim()) || [DEFAULT_PRINTER];
  return printers.length > 0 ? printers : [DEFAULT_PRINTER];
}