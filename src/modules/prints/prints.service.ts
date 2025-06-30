import { BadRequestException, Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Document } from 'mongoose';
import { Print } from './entities/print.entity';
import { CreatePrintRequestDto } from './dto/create-print-request.dto';
import { PrintsGateway } from './prints.gateway';
import { PrintJobStatus, ColorMode, Sides, Orientation, PageLayout, Margin, VALID_FILE_TYPES, FileType, UPLOAD_BASE_PATH } from './constants';
import { Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';
import * as ipp from 'ipp';

const execPromise: (command: string) => Promise<{ stdout: string; stderr: string }> = promisify(exec);

interface PrintDocument extends Document, Print {
  _id: string;
}

interface InkLevel {
  printerName: string;
  levels: { name: string; level: number }[];
}

interface PrinterConfig {
  name: string;
  ip: string;
}

interface PrinterAttributes {
  'printer-state'?: string;
  'marker-names'?: string[];
  'marker-levels'?: number[];
  'marker-high-levels'?: number[];
}

interface IppResponse {
  'printer-attributes-tag'?: PrinterAttributes;
}

interface PrinterData {
  Name: string;
  PortName: string;
}

@Injectable()
export class PrintsService implements OnModuleInit {
  private logger = new Logger('PrintsService');
  private printerConnected = false;
  private printerConfigs: PrinterConfig[] = [];
  private readonly sofficePath = 'C:\\Program Files\\LibreOffice\\program\\soffice.exe';

  constructor(
    @InjectModel(Print.name)
    private readonly printModel: Model<PrintDocument>,
    private readonly printsGateway: PrintsGateway,
  ) {}

  async onModuleInit() {
    await this.checkDependencies();
    await this.initializePrinterConnection();
    this.startPrinterAndInkMonitoring();
  }

  private async checkDependencies() {
    if (process.platform === 'win32') {
      try {
        await fs.access(this.sofficePath);
        this.logger.log(`LibreOffice found at ${this.sofficePath}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`LibreOffice not found at ${this.sofficePath}: ${errorMessage}`);
        throw new Error(`LibreOffice is required on Windows Server for file conversion. Install at ${this.sofficePath}`);
      }
    } else {
      this.logger.warn('Development environment is non-Windows. Ensure LibreOffice is installed on Windows Server deployment.');
    }
  }

  private async initializePrinterConnection() {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries && !this.printerConnected) {
      try {
        this.logger.log(`Attempt ${attempt + 1} to initialize printer connections`);
        const printers = await this.getPrinters();
        if (printers.length === 0) {
          throw new Error('No printers found');
        }
        const statusChecks = await Promise.all(printers.map(printer => this.checkPrinterStatus(printer.name)));
        this.printerConnected = statusChecks.some(status => status);
        this.logger.log(`Printer connections: ${this.printerConnected ? 'Successful' : 'Failed'}`);
        if (!this.printerConnected) {
          throw new Error('No printers are available');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Printer connection attempt ${attempt + 1} failed: ${errorMessage}`);
        if (attempt + 1 === maxRetries) {
          this.printerConnected = false;
          this.logger.error(`Max retries reached. Printer connection failed.`);
        } else {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
      attempt++;
    }
  }

  private startPrinterAndInkMonitoring() {
    const updatePrintersAndInkLevels = async () => {
      try {
        const printers = await this.getPrinters();
        this.printsGateway.emitPrinterList(printers.map(p => p.name));

        const inkLevels = await this.getInkLevels(printers);
        this.printsGateway.emitInkLevels(inkLevels);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to update printers or ink levels: ${errorMessage}`);
      }
      setTimeout(() => void updatePrintersAndInkLevels(), 30000); // Update every 30 seconds
    };
    void updatePrintersAndInkLevels();
  }

  async getPrinters(): Promise<PrinterConfig[]> {
    try {
      // Use JSON output for reliable parsing
      const command = `powershell -Command "Get-Printer | Select-Object Name, PortName | ConvertTo-Json"`;
      this.logger.log(`Executing: ${command}`);
      const { stdout, stderr } = await execPromise(command);

      // Log raw output for debugging
      this.logger.log(`Raw Get-Printer stdout: ${stdout}`);
      if (stderr) {
        this.logger.error(`Get-Printer error: ${stderr}`);
        return [];
      }

      if (!stdout) {
        this.logger.error('Get-Printer returned no output');
        return [];
      }

      let printerData: PrinterData | PrinterData[];
      try {
        printerData = JSON.parse(stdout) as PrinterData | PrinterData[];
      } catch (parseError: unknown) {
        const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown parse error';
        this.logger.error(`Failed to parse Get-Printer JSON output: ${errorMessage}`);
        return [];
      }

      // Handle single printer (object) or multiple printers (array)
      const printersArray = Array.isArray(printerData) ? printerData : [printerData];

      const printers: PrinterConfig[] = [];
      for (const printer of printersArray) {
        const name: string | undefined = printer.Name?.trim();
        let ip: string | undefined = printer.PortName?.trim();

        if (!name || !ip) {
          this.logger.warn(`Skipping printer with missing Name or PortName: ${JSON.stringify(printer)}`);
          continue;
        }

        // If PortName is not an IP, try to get HostAddress from Get-PrinterPort
        if (!ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
          try {
            const portCommand = `powershell -Command "Get-PrinterPort -Name '${ip}' | Select-Object -ExpandProperty HostAddress"`;
            this.logger.log(`Executing for IP: ${portCommand}`);
            const { stdout: portStdout, stderr: portStderr } = await execPromise(portCommand);
            if (portStderr) {
              this.logger.warn(`Get-PrinterPort error for ${name}: ${portStderr}`);
              continue;
            }
            ip = portStdout.trim();
            if (!ip || !ip.match(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/)) {
              this.logger.warn(`Invalid or missing IP for printer ${name}: ${ip}`);
              continue;
            }
          } catch (portError: unknown) {
            const errorMessage = portError instanceof Error ? portError.message : 'Unknown error';
            this.logger.warn(`Failed to get HostAddress for printer ${name}: ${errorMessage}`);
            continue;
          }
        }

        printers.push({ name, ip });
      }

      this.logger.log(`Available printers: ${JSON.stringify(printers)}`);
      this.printerConfigs = printers;
      return printers;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get printers: ${errorMessage}`);
      return [];
    }
  }

  async createPrint(createPrintDto: CreatePrintRequestDto): Promise<Print> {
    try {
      const startTime = Date.now();
      this.logger.log(`Received print request with fileType: ${createPrintDto.fileType}, buffer size: ${createPrintDto.file?.buffer?.length || 0} bytes, at ${startTime}`);
      if (!createPrintDto.file?.buffer) {
        throw new BadRequestException('File buffer is missing');
      }

      let buffer = createPrintDto.file.buffer;
      let tempInputPath: string | undefined;
      let tempPdfPath: string | undefined;

      // Validate file is a PDF by checking magic number
      if (createPrintDto.fileType.toLowerCase().includes('pdf')) {
        const magicNumber = buffer.toString('hex', 0, 4).toUpperCase();
        this.logger.log(`File magic number: ${magicNumber}`);
        if (magicNumber !== '25504446') {
          throw new BadRequestException(`Invalid PDF file: magic number ${magicNumber}, expected 25504446 (%PDF)`);
        }
      }

      // Calculate original page count
      let originalPageCount = 0;
      if (createPrintDto.fileType.toLowerCase().includes('pdf')) {
        const pdfDoc = await PDFDocument.load(buffer);
        originalPageCount = pdfDoc.getPageCount();
        this.logger.log(`Original PDF page count: ${originalPageCount}`);
      } else {
        const extension = this.getFileExtension(createPrintDto.fileType);
        const tempDir = os.tmpdir();
        tempInputPath = path.join(tempDir, `${createPrintDto.file.originalname}.${extension}`);
        await fs.writeFile(tempInputPath, buffer);
        try {
          tempPdfPath = await this.convertToPdf(tempInputPath, createPrintDto.file.originalname);
          const pdfBuffer = await fs.readFile(tempPdfPath);
          const pdfDoc = await PDFDocument.load(pdfBuffer);
          originalPageCount = pdfDoc.getPageCount();
          this.logger.log(`Converted ${createPrintDto.fileType} to PDF, original page count: ${originalPageCount}`);
          buffer = pdfBuffer;
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(`Failed to count pages for ${createPrintDto.fileType}: ${errorMessage}`);
          throw new BadRequestException(`Failed to process ${createPrintDto.fileType} file for page count: ${errorMessage}`);
        }
      }

      let modifiedBuffer: Buffer = buffer;

      // Override orientation to landscape for booklet mode
      if (createPrintDto.pageLayout === PageLayout.BOOKLET) {
        createPrintDto.orientation = Orientation.SIDEWAYS;
        this.logger.log(`Overriding orientation to landscape for booklet mode`);

        if (!createPrintDto.fileType.toLowerCase().includes('pdf')) {
          if (!tempPdfPath) {
            const extension = this.getFileExtension(createPrintDto.fileType);
            tempInputPath = tempInputPath || path.join(os.tmpdir(), `${createPrintDto.file.originalname}.${extension}`);
            await fs.writeFile(tempInputPath, buffer);
            tempPdfPath = await this.convertToPdf(tempInputPath, createPrintDto.file.originalname);
            modifiedBuffer = await fs.readFile(tempPdfPath);
            this.logger.log(`Converted ${createPrintDto.fileType} to PDF for booklet processing`);
          } else {
            modifiedBuffer = buffer;
          }
        }

        const pdfDoc = await PDFDocument.load(modifiedBuffer);
        let pageCount = pdfDoc.getPageCount();

        const pagesToAdd = (4 - (pageCount % 4)) % 4;
        if (pagesToAdd > 0) {
          this.logger.log(`Padding PDF with ${pagesToAdd} blank pages for booklet printing`);
          for (let i = 0; i < pagesToAdd; i++) {
            pdfDoc.addPage();
          }
          pageCount = pdfDoc.getPageCount();
          this.logger.log(`New PDF page count after padding: ${pageCount}`);
        }

        const newPageOrder: number[] = [];
        for (let i = 0; i < pageCount / 2; i += 2) {
          newPageOrder.push(pageCount - 1 - i);
          newPageOrder.push(i);
          newPageOrder.push(i + 1);
          newPageOrder.push(pageCount - 2 - i);
        }

        this.logger.log(`Reordered pages for booklet: ${newPageOrder.join(', ')}`);

        let finalPageOrder = newPageOrder;
        if (createPrintDto.sheetsFrom || createPrintDto.sheetsTo) {
          const totalSheets = Math.ceil(pageCount / 2);
          const sheetsFrom = createPrintDto.sheetsFrom || 1;
          const sheetsTo = createPrintDto.sheetsTo || totalSheets;

          if (sheetsFrom > sheetsTo) {
            throw new BadRequestException('sheetsFrom must be less than or equal to sheetsTo');
          }
          if (sheetsFrom < 1 || sheetsTo < 1) {
            throw new BadRequestException('sheetsFrom and sheetsTo must be at least 1');
          }
          if (sheetsTo > totalSheets) {
            throw new BadRequestException(`sheetsTo (${sheetsTo}) exceeds total sheets (${totalSheets})`);
          }

          const pagesPerSheet = 4;
          const startIndex = (sheetsFrom - 1) * pagesPerSheet;
          const endIndex = Math.min(sheetsTo * pagesPerSheet - 1, pageCount - 1);

          finalPageOrder = newPageOrder.slice(startIndex, endIndex + 1);
          this.logger.log(`Filtered pages for sheets ${sheetsFrom} to ${sheetsTo}: ${finalPageOrder.join(', ')}`);
        }

        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, finalPageOrder);
        for (const page of copiedPages) {
          newPdf.addPage(page);
        }

        modifiedBuffer = Buffer.from(await newPdf.save());
        this.logger.log(`PDF reordered for booklet printing`);
      }

      if (createPrintDto.pagesToPrint !== 'all') {
        if (createPrintDto.pagesToPrint.includes('-')) {
          const [start, end] = createPrintDto.pagesToPrint.split('-').map(num => parseInt(num, 10));
          if (isNaN(start) || isNaN(end) || start < 1 || end < start) {
            throw new BadRequestException(`Invalid page range: ${createPrintDto.pagesToPrint}. Must be a valid range (e.g., "1-5").`);
          }
        } else {
          const page = parseInt(createPrintDto.pagesToPrint, 10);
          if (isNaN(page) || page < 1) {
            throw new BadRequestException(`Invalid page to print: ${createPrintDto.pagesToPrint}. Must be a positive integer.`);
          }
        }
      }

      if (isNaN(createPrintDto.copies) || createPrintDto.copies < 1) {
        throw new BadRequestException('Invalid copies number');
      }

      const employeeId = createPrintDto.employeeId;
      const employeeName = createPrintDto.employeeName;
      const pagesPrinted = 0;

      const printData: Partial<Print> = {
        employeeId: employeeId,
        employeeName: employeeName,
        fileName: createPrintDto.file.originalname,
        fileType: createPrintDto.fileType,
        printer: createPrintDto.printer,
        paperSize: createPrintDto.paperSize,
        copies: createPrintDto.copies,
        isColor: createPrintDto.isColor ? ColorMode.COLOR : ColorMode.GRAYSCALE,
        sides: createPrintDto.sides,
        orientation: createPrintDto.orientation,
        pageLayout: createPrintDto.pageLayout,
        margins: createPrintDto.margins,
        pagesToPrint: createPrintDto.pagesToPrint,
        requestStatus: PrintJobStatus.PENDING,
        pagesPrinted,
        pages: originalPageCount,
        createdBy: employeeId,
        updatedBy: employeeId,
      };

      const savedPrint = await new this.printModel(printData).save();

      const extension = this.getFileExtension(createPrintDto.fileType);
      const date = new Date().toISOString().split('T')[0];
      const filePath = path.join(
        UPLOAD_BASE_PATH,
        employeeId,
        date,
        `${savedPrint._id.toString()}.${extension}`,
      );
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, modifiedBuffer);
      this.logger.log(`File saved: ${filePath}, took ${Date.now() - startTime}ms`);

      this.printsGateway.emitPrintUpdate(savedPrint.toObject());

      void this.sendToWindowsPrinter(savedPrint, filePath);

      if (tempInputPath) {
        await fs.unlink(tempInputPath).catch(err => this.logger.error(`Failed to delete temporary file ${tempInputPath}: ${err}`));
      }
      if (tempPdfPath) {
        await fs.unlink(tempPdfPath).catch(err => this.logger.error(`Failed to delete temporary PDF ${tempPdfPath}: ${err}`));
      }

      return savedPrint;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Failed to create print job: ${errorMessage}`);
      throw new InternalServerErrorException(`Failed to create print job: ${errorMessage}`);
    }
  }

  private async getInkLevels(printers: PrinterConfig[]): Promise<InkLevel[]> {
    const inkLevels: InkLevel[] = [];

    for (const printer of printers) {
      try {
        const printerUri = `ipp://${printer.ip}:631/ipp/print`;
        this.logger.log(`Querying IPP for ink levels: ${printerUri}`);

        const response: IppResponse = await new Promise((resolve, reject) => {
          ipp.request(
            printerUri,
            Buffer.from(JSON.stringify({
              operation: 'Get-Printer-Attributes',
              'operation-attributes-tag': {
                'requested-attributes': [
                  'marker-names',
                  'marker-levels',
                  'marker-high-levels',
                ],
              },
            })),
            (err, res) => {
              if (err) {
                reject(new Error(`IPP request failed: ${err.message || err}`));
                return;
              }
              resolve(res as IppResponse);
            },
          );
        });

        const attributes = response['printer-attributes-tag'] || {};
        const markerNames = attributes['marker-names'] || [];
        const markerLevels = attributes['marker-levels'] || [];
        const markerHighLevels = attributes['marker-high-levels'] || [];

        const levels = markerNames
          .map((name: string, index: number) => {
            const level = markerLevels[index] ?? -1;
            const maxLevel = markerHighLevels[index] ?? -1;
            if (level >= 0 && maxLevel > 0) {
              return { name, level: Math.round((level / maxLevel) * 100) };
            }
            return null;
          })
          .filter((level): level is { name: string; level: number } => level !== null);

        inkLevels.push({ printerName: printer.name, levels });
        this.logger.log(`Ink levels for ${printer.name} (${printer.ip}): ${JSON.stringify(levels)}`);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Failed to get ink levels for ${printer.name} (${printer.ip}): ${errorMessage}`);
        inkLevels.push({ printerName: printer.name, levels: [] });
      }
    }

    return inkLevels;
  }

  private async checkPrinterStatus(printerName: string): Promise<boolean> {
    try {
      const printerConfig = this.printerConfigs.find(p => p.name === printerName);
      if (!printerConfig) {
        this.logger.error(`No IP configuration found for printer ${printerName}`);
        return false;
      }

      const printerUri = `ipp://${printerConfig.ip}:631/ipp/print`;
      this.logger.log(`Checking IPP status: ${printerUri}`);

      const response: IppResponse = await new Promise((resolve, reject) => {
        ipp.request(
          printerUri,
          Buffer.from(JSON.stringify({
            operation: 'Get-Printer-Attributes',
            'operation-attributes-tag': {
              'requested-attributes': ['printer-state'],
            },
          })),
          (err, res) => {
            if (err) {
              reject(new Error(`IPP request failed: ${err.message || err}`));
              return;
            }
            resolve(res as IppResponse);
          },
        );
      });

      const state = response['printer-attributes-tag']?.['printer-state'] || 'unknown';
      this.logger.log(`Printer ${printerName} status: ${state}`);
      return state === 'idle' || state === 'processing';
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Printer status check failed for ${printerName}: ${errorMessage}`);
      return false;
    }
  }

  private async convertToPdf(filePath: string, fileName: string): Promise<string> {
    const tempDir = os.tmpdir();
    const tempPdfPath = path.join(tempDir, `${path.basename(fileName, path.extname(fileName))}.pdf`);
    this.logger.log(`Converting ${filePath} to PDF at ${tempPdfPath} using soffice`);

    try {
      if (!(await fs.access(filePath).then(() => true).catch(() => false))) {
        throw new Error(`Input file not found: ${filePath}`);
      }

      const sofficePath = process.platform === 'win32' ? this.sofficePath : 'soffice';
      const command = process.platform === 'win32'
        ? `"${sofficePath}" --headless --convert-to pdf "${filePath}" --outdir "${tempDir}"`
        : `soffice --headless --convert-to pdf "${filePath}" --outdir "${tempDir}"`;
      this.logger.log(`Executing: ${command}`);
      const { stdout, stderr } = await execPromise(command);
      if (stderr) {
        this.logger.error(`soffice stderr: ${stderr}`);
        throw new Error(`soffice conversion failed: ${stderr}`);
      }
      this.logger.log(`Conversion output: ${stdout}`);

      if (!(await fs.access(tempPdfPath).then(() => true).catch(() => false))) {
        throw new Error('PDF conversion failed: Output file not found');
      }

      return tempPdfPath;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`PDF conversion error: ${errorMessage}`);
      throw new Error(`Failed to convert file to PDF: ${errorMessage}`);
    }
  }

  async sendToWindowsPrinter(print: PrintDocument, filePath: string): Promise<void> {
    let tempPdfPath: string | undefined;
    try {
      const isPrinterAvailable = await this.checkPrinterStatus(print.printer);
      if (!isPrinterAvailable) {
        throw new Error('Printer is offline or unavailable');
      }

      this.logger.log(`Sending file to printer: ${filePath}`);

      const isXlsx = print.fileName?.toLowerCase().endsWith('.xlsx') ||
        print.fileType?.toLowerCase() === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        print.fileType?.toLowerCase() === 'xlsx';

      if (!print.fileName?.toLowerCase().endsWith('.pdf')) {
        tempPdfPath = await this.convertToPdf(filePath, print.fileName || '');
        if (tempPdfPath) {
          filePath = tempPdfPath;
        } else {
          throw new Error('PDF conversion failed: No output file produced');
        }
      }

      const psOptions: string[] = [];
      psOptions.push(`-PrinterName "${print.printer}"`);
      psOptions.push(`-FilePath "${filePath}"`);
      psOptions.push(`-Copies ${print.copies}`);
      psOptions.push(`-MediaType "${print.paperSize}"`);
      psOptions.push(`-ColorMode ${print.isColor === ColorMode.COLOR ? 'Color' : 'Monochrome'}`);

      if (print.sides === Sides.DOUBLE) {
        psOptions.push(`-Duplex ${print.pageLayout === PageLayout.BOOKLET ? 'TwoSidedShortEdge' : 'TwoSidedLongEdge'}`);
      } else {
        psOptions.push('-Duplex OneSided');
      }

      psOptions.push(`-Orientation ${print.orientation === Orientation.SIDEWAYS ? 'Landscape' : 'Portrait'}`);

      if (isXlsx) {
        psOptions.push('-FitToPage');
        psOptions.push('-LeftMargin 720');
        psOptions.push('-RightMargin 720');
        psOptions.push('-TopMargin 720');
        psOptions.push('-BottomMargin 720');
        this.logger.log('Applying XLSX settings: fit-to-page, default margins (720), user-specified orientation');
      } else {
        const margin = print.margins === Margin.NORMAL ? 720 : 360;
        psOptions.push(`-LeftMargin ${margin}`);
        psOptions.push(`-RightMargin ${margin}`);
        psOptions.push(`-TopMargin ${margin}`);
        psOptions.push(`-BottomMargin ${margin}`);
      }

      if (print.pagesToPrint !== 'all') {
        psOptions.push(`-PageRange "${print.pagesToPrint}"`);
      }

      if (print.pageLayout === PageLayout.BOOKLET) {
        psOptions.push('-NumberUp 2');
      }

      const command = `powershell -Command "Start-PrintJob ${psOptions.join(' ')}"`;
      this.logger.log(`Executing PowerShell command: ${command}`);

      const { stdout, stderr } = await execPromise(command);
      if (stderr) {
        this.logger.error(`Print command error: ${stderr}`);
        throw new Error(`Print command failed: ${stderr}`);
      }

      const match = stdout.match(/JobId: (\d+)/);
      if (!match || !match[1]) {
        throw new Error('Failed to parse job ID from print output');
      }
      const jobId = match[1];
      this.logger.log(`Print job ${jobId} sent to printer ${print.printer}`);

      void this.updatePrintStatus(
        print._id.toString(),
        PrintJobStatus.PROCESSING,
        jobId,
        new Date(),
        undefined,
        undefined,
      );
      this.monitorWindowsPrintJob(print, jobId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Failed to send to printer: ${errorMessage}`);
      void this.updatePrintStatus(print._id.toString(), PrintJobStatus.ABORTED, undefined, null, errorMessage);
    } finally {
      if (tempPdfPath && await fs.access(tempPdfPath).then(() => true).catch(() => false)) {
        await fs.unlink(tempPdfPath).catch(err => this.logger.error(`Failed to delete temporary file ${tempPdfPath}: ${err}`));
      }
    }
  }

  private getFileExtension(fileType: string): string {
    this.logger.log(`Processing fileType: ${fileType}`);
    const normalizedFileType = fileType?.toLowerCase().trim();

    if (!VALID_FILE_TYPES.includes(normalizedFileType as FileType)) {
      this.logger.error(`Invalid file type received: ${normalizedFileType}`);
      throw new BadRequestException(`Invalid file type: ${normalizedFileType}. Supported types are: ${VALID_FILE_TYPES.join(', ')}`);
    }

    switch (normalizedFileType as FileType) {
      case 'application/pdf':
      case 'pdf':
        return 'pdf';
      case 'application/msword':
      case 'doc':
        return 'doc';
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'docx':
        return 'docx';
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'xlsx':
        return 'xlsx';
      default:
        this.logger.error(`Invalid file type received: ${normalizedFileType}`);
        throw new BadRequestException(`Invalid file type: ${normalizedFileType}`);
    }
  }

  private getMimeType(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase().replace('.', '');
    switch (extension) {
      case 'pdf':
        return 'application/pdf';
      case 'doc':
      case 'docx':
        return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      case 'xlsx':
        return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      default:
        throw new BadRequestException('Unsupported file type');
    }
  }

  async updatePrintStatus(
    printId: string,
    status: PrintJobStatus,
    jobId: string | undefined,
    timestamp: Date | null,
    errorMessage?: string,
    pagesPrinted?: number,
  ): Promise<void> {
    try {
      const updateData: Partial<Print> = {
        requestStatus: status,
        jobId,
        errorMessage,
      };

      if (typeof pagesPrinted !== 'undefined') {
        updateData.pagesPrinted = pagesPrinted;
      }

      if (timestamp) {
        updateData.jobStartTime = status === PrintJobStatus.PROCESSING ? timestamp.toISOString() : undefined;
        updateData.jobEndTime =
          status === PrintJobStatus.COMPLETED || status === PrintJobStatus.ABORTED || status === PrintJobStatus.CANCELED
            ? timestamp.toISOString()
            : undefined;
      }

      await this.printModel.updateOne({ _id: printId }, { $set: updateData });

      const updatedPrint = await this.printModel.findById(printId).exec();
      if (updatedPrint) {
        this.logger.log(`Emitting full print update for print ${printId} with status ${status}`);
        this.printsGateway.emitPrintUpdate(updatedPrint.toObject());
      } else {
        this.logger.error(`Print ${printId} not found after update`);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to update print status for ${printId}: ${errorMessage}`);
    }
  }

  async getAllPrints(): Promise<Print[]> {
    return this.printModel.find().sort({ updatedAt: -1 }).exec();
  }

  async getPrintById(id: string): Promise<Print | null> {
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      throw new BadRequestException('Invalid print ID');
    }
    return this.printModel.findById(id).exec();
  }

  async getPrintsByEmployeeId(employeeId: string): Promise<Print[]> {
    if (!employeeId) {
      throw new BadRequestException('Employee ID is required');
    }
    return this.printModel.find({ employeeId }).sort({ updatedAt: -1 }).exec();
  }

  private async getJobPageCount(print: PrintDocument, jobId: string): Promise<number> {
    try {
      const command = `powershell -Command "Get-PrintJob -PrinterName '${print.printer}' -ID ${jobId} | Select-Object -ExpandProperty TotalPages"`;
      this.logger.log(`Executing: ${command}`);
      const { stdout, stderr } = await execPromise(command);
      if (stderr) {
        this.logger.error(`Get-PrintJob error: ${stderr}`);
        return 0;
      }
      if (!stdout) {
        this.logger.warn(`Get-PrintJob returned no output for job ${jobId}`);
        return 0;
      }
      const pages = parseInt(stdout.trim(), 10);
      if (isNaN(pages)) {
        this.logger.warn(`Could not parse page count from Get-PrintJob: ${stdout}`);
        return 0;
      }
      this.logger.log(`Get-PrintJob reported ${pages} pages for job ${jobId}`);
      return pages;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get page count: ${errorMessage}`);
      return 0;
    }
  }

  private async processJobStatus(
    print: PrintDocument,
    jobId: string,
    checkStatus: () => void,
  ): Promise<void> {
    try {
      const command = `powershell -Command "Get-PrintJob -PrinterName '${print.printer}' -ID ${jobId} | Select-Object JobStatus, TotalPages"`;
      this.logger.log(`Executing: ${command}`);
      const { stdout, stderr } = await execPromise(command);
      if (stderr) {
        this.logger.error(`Get-PrintJob error: ${stderr}`);
        await this.updatePrintStatus(print._id.toString(), PrintJobStatus.ABORTED, undefined, null, `Job status check failed: ${stderr}`);
        return;
      }

      const match = stdout.match(/JobStatus\s*:\s*(\w+).*TotalPages\s*:\s*(\d+)/s);
      if (!match) {
        this.logger.error(`Invalid Get-PrintJob response: ${stdout}`);
        await this.updatePrintStatus(print._id.toString(), PrintJobStatus.ABORTED, undefined, null, 'Invalid job status response');
        return;
      }

      const [, jobState, pagesCompletedStr] = match;
      const pagesCompleted = parseInt(pagesCompletedStr, 10) || 0;

      let status: PrintJobStatus;
      switch (jobState.toLowerCase()) {
        case 'printing':
          status = PrintJobStatus.PROCESSING;
          break;
        case 'completed':
          status = PrintJobStatus.COMPLETED;
          break;
        case 'error':
          status = PrintJobStatus.ABORTED;
          break;
        case 'paused':
          status = PrintJobStatus.HELD;
          break;
        case 'deleted':
          status = PrintJobStatus.CANCELED;
          break;
        default:
          status = PrintJobStatus.PENDING;
      }

      let calculatedPagesPrinted = 0;
      if (status === PrintJobStatus.COMPLETED) {
        if (pagesCompleted > 0) {
          if (print.pageLayout === PageLayout.BOOKLET) {
            calculatedPagesPrinted = Math.ceil(pagesCompleted / 4) * print.copies;
            this.logger.log(`Using pages-completed for booklet: ${calculatedPagesPrinted} (pages: ${pagesCompleted}, sheets: ${Math.ceil(pagesCompleted / 4)}, copies: ${print.copies})`);
          } else {
            calculatedPagesPrinted = pagesCompleted * print.copies;
            this.logger.log(`Using pages-completed: ${calculatedPagesPrinted} (pages: ${pagesCompleted}, copies: ${print.copies})`);
          }
        } else {
          const fallbackPages = await this.getJobPageCount(print, jobId);
          if (fallbackPages > 0) {
            let pagesPerSheet = 1;
            if (print.pageLayout === PageLayout.BOOKLET) {
              pagesPerSheet = 1;
            } else if (print.sides === Sides.DOUBLE) {
              pagesPerSheet = 2;
            }
            calculatedPagesPrinted = fallbackPages * pagesPerSheet * print.copies;
            this.logger.log(`Calculated pagesPrinted: ${calculatedPagesPrinted} (pages: ${fallbackPages}, pagesPerSheet: ${pagesPerSheet}, copies: ${print.copies})`);
          } else {
            this.logger.warn(`No reliable page count available for job ${jobId}, defaulting to 0`);
          }
        }
      }

      await this.updatePrintStatus(
        print._id.toString(),
        status,
        jobId,
        status === PrintJobStatus.COMPLETED || status === PrintJobStatus.ABORTED || status === PrintJobStatus.CANCELED
          ? new Date()
          : null,
        status === PrintJobStatus.ABORTED || status === PrintJobStatus.CANCELED ? `Job ${jobState}` : undefined,
        status === PrintJobStatus.COMPLETED ? calculatedPagesPrinted : undefined,
      );

      if (status !== PrintJobStatus.COMPLETED && status !== PrintJobStatus.ABORTED && status === PrintJobStatus.CANCELED) {
        setTimeout(checkStatus, 1000);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Job status check failed: ${errorMessage}`);
      await this.updatePrintStatus(print._id.toString(), PrintJobStatus.ABORTED, undefined, null, errorMessage);
    }
  }

  monitorWindowsPrintJob(print: PrintDocument, jobId: string): void {
    const checkStatus = () => {
      void this.processJobStatus(print, jobId, checkStatus);
    };
    checkStatus();
  }
}