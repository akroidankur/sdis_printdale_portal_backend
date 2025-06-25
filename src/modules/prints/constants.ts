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
export const CUPS_SERVER_IP = '192.168.1.5';
export const PRINTER_IP = '192.168.1.13';
export const DEFAULT_PRINTER = 'ricoh-m2701';
export const UPLOAD_BASE_PATH = '/home/akroid/print_uploads';
export const CUPS_ADMIN_USERNAME = process.env.CUPS_ADMIN_USERNAME || 'admin';
export const CUPS_ADMIN_PASSWORD = process.env.CUPS_ADMIN_PASSWORD || '';

export function getPrinters(): string[] {
  const printers = process.env.PRINTERS?.split(',').map(p => p.trim()) || [DEFAULT_PRINTER];
  return printers.length > 0 ? printers : [DEFAULT_PRINTER];
}

// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:43 AM     LOG [PrintsGateway] Emitting print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:44 AM     LOG [PrintsService] Job status {"version":"2.0","statusCode":"successful-ok","id":60928313,"operation-attributes-tag":{"attributes-charset":"utf-8","attributes-natural-language":"en-us"},"job-attributes-tag":{"job-id":37,"job-state":"processing","job-impressions-completed":2,"job-media-sheets-completed":1}}
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:44 AM    WARN [PrintsService] pages-completed missing in IPP response for job 37, defaulting to 0
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:44 AM     LOG [PrintsService] Emitting full print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:44 AM     LOG [PrintsGateway] Emitting print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:45 AM     LOG [PrintsService] Job status {"version":"2.0","statusCode":"successful-ok","id":42330515,"operation-attributes-tag":{"attributes-charset":"utf-8","attributes-natural-language":"en-us"},"job-attributes-tag":{"job-id":37,"job-state":"processing","job-impressions-completed":2,"job-media-sheets-completed":1}}
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:45 AM    WARN [PrintsService] pages-completed missing in IPP response for job 37, defaulting to 0
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:46 AM     LOG [PrintsService] Emitting full print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:46 AM     LOG [PrintsGateway] Emitting print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:47 AM     LOG [PrintsService] Job status {"version":"2.0","statusCode":"successful-ok","id":23823246,"operation-attributes-tag":{"attributes-charset":"utf-8","attributes-natural-language":"en-us"},"job-attributes-tag":{"job-id":37,"job-state":"processing","job-impressions-completed":2,"job-media-sheets-completed":1}}
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:47 AM    WARN [PrintsService] pages-completed missing in IPP response for job 37, defaulting to 0
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:47 AM     LOG [PrintsService] Emitting full print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:47 AM     LOG [PrintsGateway] Emitting print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:48 AM     LOG [PrintsService] Job status {"version":"2.0","statusCode":"successful-ok","id":52011377,"operation-attributes-tag":{"attributes-charset":"utf-8","attributes-natural-language":"en-us"},"job-attributes-tag":{"job-id":37,"job-state":"processing","job-impressions-completed":2,"job-media-sheets-completed":1}}
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:48 AM    WARN [PrintsService] pages-completed missing in IPP response for job 37, defaulting to 0
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:48 AM     LOG [PrintsService] Emitting full print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:48 AM     LOG [PrintsGateway] Emitting print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:49 AM     LOG [PrintsService] Job status {"version":"2.0","statusCode":"successful-ok","id":54661002,"operation-attributes-tag":{"attributes-charset":"utf-8","attributes-natural-language":"en-us"},"job-attributes-tag":{"job-id":37,"job-state":"completed","job-impressions-completed":2,"job-media-sheets-completed":1}}
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:49 AM    WARN [PrintsService] pages-completed missing in IPP response for job 37, defaulting to 0
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:49 AM     LOG [PrintsService] Executing lpstat command: lpstat -W completed -l -p ricoh-m2701 | grep ricoh-m2701-37
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:49 AM   ERROR [PrintsService] Failed to get page count from lpstat: Command failed: lpstat -W completed -l -p ricoh-m2701 | grep ricoh-m2701-37
// 0|sdis-backend  | 
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:49 AM     LOG [PrintsService] Calculated pagesCompleted: 2 (sheetsCompleted: 1, pagesPerSheet: 2)
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:49 AM     LOG [PrintsService] Emitting full print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:08:49 AM     LOG [PrintsGateway] Emitting print update for print 6850f13045ff434fb89915b9
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:10:07 AM     LOG [PrintsGateway] Client disconnected: Odc_mFYYUykXFEKbAAAN
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:10:48 AM     LOG [PrintsGateway] Client connected: mcPtLIsYcxKkfr9bAAAP
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:10:49 AM     LOG [PrintsGateway] Client mcPtLIsYcxKkfr9bAAAP subscribed to print updates
// 0|sdis-backend  | [Nest] 8788  - 06/17/2025, 10:15:17 AM     LOG [PrintsGateway] Client disconnected: mcPtLIsYcxKkfr9bAAAP
