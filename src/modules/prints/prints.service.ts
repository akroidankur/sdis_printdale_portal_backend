import { BadRequestException, Injectable, InternalServerErrorException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Document } from 'mongoose';
import { Print } from './entities/print.entity';
import { CreatePrintRequestDto } from './dto/create-print-request.dto';
import { PrintsGateway } from './prints.gateway';
import * as ipp from 'ipp';
import { CUPS_SERVER_IP, PrintRequestStatus, ColorMode, Sides, Orientation, PageLayout, Margin, DEFAULT_PRINTER, VALID_FILE_TYPES, FileType } from './constants';
import { Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import fetch, { Response } from 'node-fetch';
import { UPLOAD_BASE_PATH } from './constants';
import { PDFDocument } from 'pdf-lib';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execPromise: (command: string) => Promise<{ stdout: string; stderr: string }> = promisify(exec);

interface IPPResponse {
  version?: string;
  statusCode?: string;
  id?: number;
  'operation-attributes-tag'?: {
    'attributes-charset'?: string;
    'attributes-natural-language'?: string;
    'status-message'?: string;
  };
  'printer-attributes-tag'?: {
    'printer-is-accepting-jobs'?: boolean;
    'printer-state'?: string | number;
    'printer-state-reasons'?: string | string[] | undefined;
  };
  'job-attributes-tag'?: {
    'job-id'?: number;
    'job-state'?: string;
    'pages-completed'?: number;
    'job-media-sheets-completed'?: number;
    'job-impressions-completed'?: number;
  };
}

interface IPPPrinter {
  execute: (operation: string, params: object, callback: (err: Error | null, res: IPPResponse | undefined) => void) => void;
}

interface Params {
  'operation-attributes-tag': {
    'requested-attributes'?: string[];
    'job-id'?: number;
    'requesting-user-name'?: string;
  };
}

interface PrintDocument extends Document, Print {
  _id: string;
}

interface CustomPrinterOptions extends ipp.PrinterOptions {
  username?: string;
  password?: string;
}

@Injectable()
export class PrintsService implements OnModuleInit {
  private logger = new Logger('PrintsService');
  private printerConnected = false;
  private readonly adminUsername = process.env.CUPS_ADMIN_USERNAME || 'admin';
  private readonly adminPassword = process.env.CUPS_ADMIN_PASSWORD || '';

  constructor(
    @InjectModel(Print.name)
    private readonly printModel: Model<PrintDocument>,
    private readonly printsGateway: PrintsGateway,
  ) { }

  async onModuleInit() {
    await this.initializePrinterConnection();
  }

  private async initializePrinterConnection() {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries && !this.printerConnected) {
      try {
        this.logger.log(`Attempt ${attempt + 1} to connect to printer ${DEFAULT_PRINTER}`);
        const isPrinterAvailable = await this.checkPrinterStatus(DEFAULT_PRINTER);
        this.printerConnected = isPrinterAvailable;
        this.logger.log(`Printer connection to ${DEFAULT_PRINTER} at ${CUPS_SERVER_IP}: ${isPrinterAvailable ? 'Successful' : 'Failed'}`);
        if (!isPrinterAvailable) {
          throw new Error('Printer check failed');
        }
      } catch (error) {
        this.logger.error(`Printer connection attempt ${attempt + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
        // For DOCX/XLSX, convert to PDF and count pages
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
          // Keep the PDF buffer for booklet processing
          buffer = pdfBuffer;
        } catch (error) {
          this.logger.warn(`Failed to count pages for ${createPrintDto.fileType}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          throw new BadRequestException(`Failed to process ${createPrintDto.fileType} file for page count: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      let modifiedBuffer: Buffer = buffer;

      // Override orientation to landscape for booklet mode to match Adobe Acrobat
      if (createPrintDto.pageLayout === PageLayout.BOOKLET) {
        createPrintDto.orientation = Orientation.SIDEWAYS;
        this.logger.log(`Overriding orientation to landscape for booklet mode`);

        // Ensure the buffer is a PDF for booklet processing
        if (!createPrintDto.fileType.toLowerCase().includes('pdf')) {
          if (!tempPdfPath) {
            // If tempPdfPath wasn't created during page counting, convert now
            const extension = this.getFileExtension(createPrintDto.fileType);
            tempInputPath = tempInputPath || path.join(os.tmpdir(), `${createPrintDto.file.originalname}.${extension}`);
            await fs.writeFile(tempInputPath, buffer);
            tempPdfPath = await this.convertToPdf(tempInputPath, createPrintDto.file.originalname);
            modifiedBuffer = await fs.readFile(tempPdfPath);
            this.logger.log(`Converted ${createPrintDto.fileType} to PDF for booklet processing`);
          } else {
            modifiedBuffer = buffer; // Use the PDF buffer from page counting
          }
        }

        // Handle booklet mode - Reordering pages
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

      // Validate pagesToPrint
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
        requestStatus: PrintRequestStatus.PENDING,
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

      void this.sendToCups(savedPrint, filePath);

      // Clean up temporary files
      if (tempInputPath) {
        await fs.unlink(tempInputPath).catch(err => this.logger.error(`Failed to delete temporary file ${tempInputPath}: ${err}`));
      }
      if (tempPdfPath) {
        await fs.unlink(tempPdfPath).catch(err => this.logger.error(`Failed to delete temporary PDF ${tempPdfPath}: ${err}`));
      }

      return savedPrint;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Failed to create print job: ${errorMessage}`);
      throw new InternalServerErrorException(`Failed to create print job: ${errorMessage}`);
    }
  }

  private async checkCupsAvailability(): Promise<boolean> {
    try {
      const response: Response = await fetch(`http://${CUPS_SERVER_IP}:631`);
      this.logger.log(`CUPS availability check: ${response.ok ? 'OK' : 'Failed'}`);
      return response.ok;
    } catch (error) {
      this.logger.error(`CUPS availability check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  private async checkPrinterStatus(printerName: string): Promise<boolean> {
    try {
      const options: CustomPrinterOptions = {
        username: this.adminUsername,
        password: this.adminPassword,
      };
      const printer = new ipp.Printer(`ipp://${CUPS_SERVER_IP}:631/printers/${printerName}`, options) as IPPPrinter;
      return new Promise((resolve) => {
        const params: Params = {
          'operation-attributes-tag': {
            'requested-attributes': ['printer-state', 'printer-state-reasons', 'printer-is-accepting-jobs'],
          },
        };
        if (this.adminPassword) {
          params['operation-attributes-tag']['requesting-user-name'] = this.adminUsername;
        }
        printer.execute('Get-Printer-Attributes', params, (err: Error | null, res: IPPResponse) => {
          if (err) {
            this.logger.error(`Printer status check error: ${err.message}`);
            this.logger.log(`IPP error details: ${JSON.stringify(err)}`);
            resolve(false);
            return;
          }
          if (!res || !res['printer-attributes-tag']) {
            this.logger.error(`Printer status check failed: Invalid or missing response`);
            this.logger.log(`IPP response: ${JSON.stringify(res)}`);
            resolve(false);
            return;
          }
          const printerState = res['printer-attributes-tag']['printer-state'];
          const stateReasons = res['printer-attributes-tag']['printer-state-reasons'] || 'unknown';
          const acceptingJobs = res['printer-attributes-tag']['printer-is-accepting-jobs'] ?? false;
          const reasonsString = Array.isArray(stateReasons) ? stateReasons.join(', ') : stateReasons;
          this.logger.log(`Printer ${printerName} state: ${printerState}, reasons: ${reasonsString}, accepting: ${acceptingJobs}`);
          const isIdle = printerState === 'idle' || printerState === 3;
          resolve(isIdle && acceptingJobs);
        });
      });
    } catch (error) {
      this.logger.error(`Printer status check exception: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  private async convertToPdf(filePath: string, fileName: string): Promise<string> {
    const tempDir = os.tmpdir();
    const tempPdfPath = path.join(tempDir, `${path.basename(fileName, path.extname(fileName))}.pdf`);
    this.logger.log(`Converting ${filePath} to PDF at ${tempPdfPath} using unoconv`);

    try {
      // Verify input file exists
      if (!(await fs.access(filePath).then(() => true).catch(() => false))) {
        throw new Error(`Input file not found: ${filePath}`);
      }

      // Attempt to verify unoconv is available
      try {
        const { stdout: unoconvVersion, stderr: versionStderr } = await execPromise('unoconv --version');
        if (versionStderr && !versionStderr.includes('DeprecationWarning')) {
          this.logger.warn(`unoconv --version stderr: ${versionStderr}`);
        }
        this.logger.log(`unoconv version: ${unoconvVersion.trim()}`);
      } catch (error) {
        this.logger.warn(`unoconv version check failed: ${error instanceof Error ? error.message : 'Unknown error'}. Proceeding with conversion.`);
      }

      const unoconvCommand = `unoconv -f pdf -o "${tempPdfPath}" "${filePath}"`;
      this.logger.log(`Executing: ${unoconvCommand}`);
      const { stdout, stderr } = await execPromise(unoconvCommand);
      if (stderr && !stderr.includes('DeprecationWarning')) {
        this.logger.error(`unoconv stderr: ${stderr}`);
        throw new Error(`unoconv conversion failed: ${stderr}`);
      }
      this.logger.log(`Conversion output: ${stdout}`);
      if (stderr.includes('DeprecationWarning')) {
        this.logger.warn(`unoconv emitted DeprecationWarning: ${stderr}`);
      }

      if (!(await fs.access(tempPdfPath).then(() => true).catch(() => false))) {
        throw new Error('PDF conversion failed: Output file not found');
      }

      return tempPdfPath;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`PDF conversion error: ${errorMessage}`);
      throw new Error(`Failed to convert file to PDF: ${errorMessage}`);
    }
  }

  async sendToCups(print: PrintDocument, filePath: string): Promise<void> {
    let tempPdfPath: string | undefined;
    try {
      const isCupsAvailable = await this.checkCupsAvailability();
      if (!isCupsAvailable) {
        throw new Error('CUPS server is not available');
      }

      const isPrinterAvailable = await this.checkPrinterStatus(print.printer);
      if (!isPrinterAvailable) {
        throw new Error('Printer is offline or unavailable');
      }

      this.logger.log(`Sending file to CUPS: ${filePath}`);

      const lpOptions: string[] = [];
      lpOptions.push(`-d ${print.printer}`);
      lpOptions.push(`-n ${print.copies}`);
      lpOptions.push(`-o media=${print.paperSize}`);
      lpOptions.push(`-o print-color-mode=${print.isColor === ColorMode.COLOR ? 'color' : 'monochrome'}`);

      const isXlsx = print.fileName?.toLowerCase().endsWith('.xlsx') ||
        print.fileType?.toLowerCase() === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        print.fileType?.toLowerCase() === 'xlsx';

      if (print.sides === Sides.DOUBLE) {
        if (print.pageLayout === PageLayout.BOOKLET) {
          lpOptions.push('-o sides=two-sided-short-edge');
        } else {
          lpOptions.push('-o sides=two-sided-long-edge');
        }
      } else {
        lpOptions.push('-o sides=one-sided');
      }

      lpOptions.push(`-o orientation-requested=${print.orientation === Orientation.SIDEWAYS ? 'landscape' : 'portrait'}`);

      lpOptions.push(`-o number-up=${print.pageLayout === PageLayout.BOOKLET ? 2 : 1}`);
      if (print.pageLayout === PageLayout.BOOKLET) {
        lpOptions.push('-o number-up-layout=btlr');
      }

      if (isXlsx) {
        lpOptions.push('-o fit-to-page');
        lpOptions.push('-o media-left-margin=720');
        lpOptions.push('-o media-right-margin=720');
        lpOptions.push('-o media-top-margin=720');
        lpOptions.push('-o media-bottom-margin=720');
        this.logger.log('Applying XLSX settings: fit-to-page, default margins (720), user-specified orientation');
      } else {
        lpOptions.push(`-o media-left-margin=${print.margins === Margin.NORMAL ? 720 : 360}`);
        lpOptions.push(`-o media-right-margin=${print.margins === Margin.NORMAL ? 720 : 360}`);
        lpOptions.push(`-o media-top-margin=${print.margins === Margin.NORMAL ? 720 : 360}`);
        lpOptions.push(`-o media-bottom-margin=${print.margins === Margin.NORMAL ? 720 : 360}`);
      }

      if (print.pagesToPrint !== 'all') {
        if (print.pagesToPrint.includes('-')) {
          lpOptions.push(`-P ${print.pagesToPrint}`);
        } else {
          const page = parseInt(print.pagesToPrint, 10);
          if (isNaN(page) || page < 1) {
            throw new Error(`Invalid page range: ${print.pagesToPrint}`);
          }
          lpOptions.push(`-P ${page}`);
        }
      }

      if (this.adminPassword) {
        lpOptions.push(`-U ${this.adminUsername}`);
      }

      if (!print.fileName?.toLowerCase().endsWith('.pdf')) {
        tempPdfPath = await this.convertToPdf(filePath, print.fileName || '');
        if (tempPdfPath) {
          filePath = tempPdfPath;
        } else {
          throw new Error('PDF conversion failed: No output file produced');
        }
      }

      const lpCommand = `lp ${lpOptions.join(' ')} "${filePath}"`;
      this.logger.log(`Executing lp command: ${lpCommand}`);

      const { stdout, stderr } = await execPromise(lpCommand);
      if (stderr) {
        this.logger.error(`lp command error: ${stderr}`);
        throw new Error(`lp command failed: ${stderr}`);
      }

      const match = stdout.match(/request id is \S+-(\d+)/);
      if (!match || !match[1]) {
        throw new Error('Failed to parse job ID from lp output');
      }
      const jobId = match[1];
      this.logger.log(`Print job ${jobId} sent to printer ${print.printer}`);

      void this.updatePrintStatus(
        print._id.toString(),
        PrintRequestStatus.SENT_TO_PRINTER,
        jobId,
        new Date(),
        undefined,
        undefined,
      );
      this.monitorPrintJob(print, jobId);
    } catch (error: unknown) {
      const errorMessage = (error instanceof Error) ? error.message : 'Unknown error occurred';
      this.logger.error(`Failed to send to CUPS: ${errorMessage}`);
      void this.updatePrintStatus(print._id.toString(), PrintRequestStatus.FAILED, undefined, null, errorMessage);
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
    status: PrintRequestStatus,
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
        updateData.jobStartTime = status === PrintRequestStatus.SENT_TO_PRINTER ? timestamp.toISOString() : undefined;
        updateData.jobEndTime =
          status === PrintRequestStatus.FAILED || status === PrintRequestStatus.COMPLETED ? timestamp.toISOString() : undefined;
      }

      await this.printModel.updateOne({ _id: printId }, { $set: updateData });

      const updatedPrint = await this.printModel.findById(printId).exec();
      if (updatedPrint) {
        this.logger.log(`Emitting full print update for print ${printId}`);
        this.printsGateway.emitPrintUpdate(updatedPrint.toObject());
      } else {
        this.logger.error(`Print ${printId} not found after update`);
      }
    } catch (error) {
      this.logger.error(`Failed to update print status for ${printId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

  private async getJobPageCountFromLpstat(jobId: string, printerName: string): Promise<number> {
    try {
      const lpstatCommand = `lpstat -W completed -l -p ${printerName} | grep ${printerName}-${jobId}`;
      this.logger.log(`Executing lpstat command: ${lpstatCommand}`);
      const { stdout, stderr } = await execPromise(lpstatCommand);
      if (stderr) {
        this.logger.error(`lpstat command error: ${stderr}`);
        return 0;
      }
      if (!stdout) {
        this.logger.warn(`lpstat returned no output for job ${jobId}`);
        return 0;
      }
      const match = stdout.match(/\S+\s+\S+\s+\S+\s+\S+\s+(\d+)/);
      if (match && match[1]) {
        const sheetsCompleted = parseInt(match[1], 10);
        this.logger.log(`lpstat reported ${sheetsCompleted} sheets for job ${jobId}`);
        return sheetsCompleted;
      }
      this.logger.warn(`Could not parse sheet count from lpstat output: ${stdout}`);
      return 0;
    } catch (error) {
      this.logger.error(`Failed to get sheet count from lpstat: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 0;
    }
  }

  private async processJobStatus(
    print: PrintDocument,
    jobId: string,
    res: IPPResponse,
    checkStatus: () => void,
  ): Promise<void> {
    this.logger.log(`Job status ${JSON.stringify(res)}`);
    if (!res || !res['job-attributes-tag']) {
      const errorMessage = 'Invalid response: no job attributes';
      this.logger.error(errorMessage);
      await this.updatePrintStatus(print._id.toString(), PrintRequestStatus.FAILED, undefined, null, errorMessage);
      return;
    }
    const jobState = res['job-attributes-tag']['job-state'];
    const pagesCompleted = res['job-attributes-tag']['pages-completed'] || 0;
    const sheetsCompleted = res['job-attributes-tag']['job-media-sheets-completed'] || 0;

    if (!res['job-attributes-tag']['pages-completed']) {
      this.logger.warn(`pages-completed missing in IPP response for job ${jobId}, defaulting to 0`);
    }
    if (!res['job-attributes-tag']['job-media-sheets-completed']) {
      this.logger.warn(`job-media-sheets-completed missing in IPP response for job ${jobId}, defaulting to 0`);
    }

    let status: PrintRequestStatus;
    switch (jobState) {
      case 'pending':
      case 'pending-held':
        status = PrintRequestStatus.PENDING;
        break;
      case 'processing':
        status = PrintRequestStatus.SENT_TO_PRINTER;
        break;
      case 'completed':
        status = PrintRequestStatus.COMPLETED;
        break;
      default:
        status = PrintRequestStatus.FAILED;
    }

    let calculatedPagesPrinted = 0;
    if (status === PrintRequestStatus.COMPLETED) {
      if (pagesCompleted > 0) {
        if (print.pageLayout === PageLayout.BOOKLET) {
          calculatedPagesPrinted = Math.ceil(pagesCompleted / 4) * print.copies;
          this.logger.log(`Using pages-completed for booklet: ${calculatedPagesPrinted} (pages: ${pagesCompleted}, sheets: ${Math.ceil(pagesCompleted / 4)}, copies: ${print.copies})`);
        } else {
          calculatedPagesPrinted = pagesCompleted * print.copies;
          this.logger.log(`Using pages-completed from IPP: ${calculatedPagesPrinted} (pages: ${pagesCompleted}, copies: ${print.copies})`);
        }
      } else {
        const sheetsFromLpstat = await this.getJobPageCountFromLpstat(jobId, print.printer);
        if (sheetsFromLpstat > 0) {
          let pagesPerSheet = 1;
          if (print.pageLayout === PageLayout.BOOKLET) {
            pagesPerSheet = 1;
          } else if (print.sides === Sides.DOUBLE) {
            pagesPerSheet = 2;
          }
          calculatedPagesPrinted = sheetsFromLpstat * pagesPerSheet * print.copies;
          this.logger.log(`Calculated pagesPrinted from lpstat: ${calculatedPagesPrinted} (sheets: ${sheetsFromLpstat}, pagesPerSheet: ${pagesPerSheet}, copies: ${print.copies})`);
        } else if (sheetsCompleted > 0) {
          let pagesPerSheet = 1;
          if (print.pageLayout === PageLayout.BOOKLET) {
            pagesPerSheet = 1;
          } else if (print.sides === Sides.DOUBLE) {
            pagesPerSheet = 2;
          }
          calculatedPagesPrinted = sheetsCompleted * pagesPerSheet * print.copies;
          this.logger.log(`Calculated pagesPrinted from IPP sheets: ${calculatedPagesPrinted} (sheets: ${sheetsCompleted}, pagesPerSheet: ${pagesPerSheet}, copies: ${print.copies})`);
        } else {
          const impressionsCompleted = res['job-attributes-tag']['job-impressions-completed'] || 0;
          if (impressionsCompleted > 0) {
            calculatedPagesPrinted = impressionsCompleted * print.copies;
            this.logger.log(`Using job-impressions-completed: ${calculatedPagesPrinted} (impressions: ${impressionsCompleted}, copies: ${print.copies})`);
          } else {
            this.logger.warn(`No reliable page count available for job ${jobId}, defaulting to 0`);
          }
        }
      }
    }

    await this.updatePrintStatus(
      print._id.toString(),
      status,
      jobId,
      status === PrintRequestStatus.COMPLETED || status === PrintRequestStatus.FAILED ? new Date() : null,
      status === PrintRequestStatus.FAILED ? `Job ${jobState}` : undefined,
      status === PrintRequestStatus.COMPLETED ? calculatedPagesPrinted : undefined,
    );

    if (status !== PrintRequestStatus.FAILED && status !== PrintRequestStatus.COMPLETED) {
      setTimeout(checkStatus, 1000);
    }
  }

  monitorPrintJob(print: PrintDocument, jobId: string): void {
    const options: CustomPrinterOptions = {
      username: this.adminUsername,
      password: this.adminPassword,
    };
    const printer = new ipp.Printer(`ipp://${CUPS_SERVER_IP}:631/printers/${print.printer}`, options) as IPPPrinter;
    const checkStatus = () => {
      const params: Params = {
        'operation-attributes-tag': {
          'job-id': Number(jobId),
          'requested-attributes': ['job-id', 'job-state', 'pages-completed', 'job-media-sheets-completed', 'job-impressions-completed'],
        },
      };
      if (this.adminPassword) {
        params['operation-attributes-tag']['requesting-user-name'] = this.adminUsername;
      }
      printer.execute('Get-Job-Attributes', params, (err: Error | null, res: IPPResponse) => {
        if (err) {
          const errorMessage = `Job status error: ${err.message}`;
          this.logger.error(errorMessage);
          void this.updatePrintStatus(print._id.toString(), PrintRequestStatus.FAILED, undefined, null, errorMessage);
          return;
        }
        void this.processJobStatus(print, jobId, res, checkStatus);
      });
    };
    checkStatus();
  }
}