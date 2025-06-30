import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Document } from 'mongoose';
import { Print } from './entities/print.entity';
import { CreatePrintRequestDto } from './dto/create-print-request.dto';
import { PrintsGateway } from './prints.gateway';
import { PrintJobStatus, ColorMode, Sides, Orientation, PageLayout, VALID_FILE_TYPES, FileType, UPLOAD_BASE_PATH } from './constants';
import { Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PDFDocument } from 'pdf-lib';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as os from 'os';

const execPromise = promisify(exec);

interface PrintDocument extends Document, Print {
  _id: string;
}

interface Printer {
  name: string;
  status: string;
}

@Injectable()
export class PrintsService {
  private logger = new Logger('PrintsService');

  constructor(
    @InjectModel(Print.name)
    private readonly printModel: Model<PrintDocument>,
    private readonly printsGateway: PrintsGateway,
  ) {}

  async getAvailablePrinters(): Promise<Printer[]> {
    try {
      const command = 'Get-Printer | Select-Object Name,PrinterStatus | ConvertTo-Json';
      this.logger.log(`Executing PowerShell command: ${command}`);
      const { stdout, stderr } = await execPromise(`powershell -Command "${command}"`);
      if (stderr) {
        this.logger.error(`Get-Printer error: ${stderr}`);
        throw new Error(`Failed to fetch printers: ${stderr}`);
      }
      // Explicitly type the JSON output
      const printers: { Name: string; PrinterStatus: string }[] = JSON.parse(stdout) as { Name: string; PrinterStatus: string }[];
      const printerList = Array.isArray(printers) ? printers : [printers];
      return printerList.map(p => ({
        name: p.Name,
        status: p.PrinterStatus,
      }));
    } catch (error) {
      this.logger.error(`Failed to get printers: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

      if (createPrintDto.fileType.toLowerCase().includes('pdf')) {
        const magicNumber = buffer.toString('hex', 0, 4).toUpperCase();
        this.logger.log(`File magic number: ${magicNumber}`);
        if (magicNumber !== '25504446') {
          throw new BadRequestException(`Invalid PDF file: magic number ${magicNumber}, expected 25504446 (%PDF)`);
        }
      }

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
        } catch (error) {
          this.logger.warn(`Failed to count pages for ${createPrintDto.fileType}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          throw new BadRequestException(`Failed to process ${createPrintDto.fileType} file for page count: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      let modifiedBuffer: Buffer = buffer;

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

      void this.sendToPrinter(savedPrint, filePath);

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

  private async checkPrinterStatus(printerName: string): Promise<boolean> {
    try {
      const command = `Get-Printer -Name "${printerName}" | Select-Object -ExpandProperty PrinterStatus`;
      this.logger.log(`Executing PowerShell command: ${command}`);
      const { stdout, stderr } = await execPromise(`powershell -Command "${command}"`);
      if (stderr) {
        this.logger.error(`Get-Printer error: ${stderr}`);
        return false;
      }
      const status = stdout.trim().toLowerCase();
      this.logger.log(`Printer ${printerName} status: ${status}`);
      return status === 'normal' || status === 'idle';
    } catch (error) {
      this.logger.error(`Printer status check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  private async convertToPdf(filePath: string, fileName: string): Promise<string> {
    const tempDir = os.tmpdir();
    const tempPdfPath = path.join(tempDir, `${path.basename(fileName, path.extname(fileName))}.pdf`);
    this.logger.log(`Converting ${filePath} to PDF at ${tempPdfPath} using PowerShell`);

    try {
      const psCommand = `
        $word = New-Object -ComObject Word.Application;
        $word.Visible = $false;
        $doc = $word.Documents.Open("${filePath}");
        $doc.SaveAs([ref] "${tempPdfPath}", [ref] 17);
        $doc.Close();
        $word.Quit();
      `;
      const { stderr } = await execPromise(`powershell -Command "${psCommand}"`);
      if (stderr) {
        this.logger.error(`PowerShell conversion error: ${stderr}`);
        throw new Error(`PowerShell conversion failed: ${stderr}`);
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

  async sendToPrinter(print: PrintDocument, filePath: string): Promise<void> {
    let tempPdfPath: string | undefined;
    try {
      const isPrinterAvailable = await this.checkPrinterStatus(print.printer);
      if (!isPrinterAvailable) {
        throw new Error('Printer is offline or unavailable');
      }

      this.logger.log(`Sending file to printer: ${filePath}`);

      const printOptions: string[] = [];
      printOptions.push(`-PrinterName "${print.printer}"`);
      printOptions.push(`-ArgumentList "-PaperSize ${print.paperSize}"`);
      if (print.isColor === ColorMode.COLOR) {
        printOptions.push('-ArgumentList "-Color"');
      } else {
        printOptions.push('-ArgumentList "-Monochrome"');
      }
      if (print.sides === Sides.DOUBLE) {
        if (print.pageLayout === PageLayout.BOOKLET) {
          printOptions.push('-ArgumentList "-Duplex TwoSidedShortEdge"');
        } else {
          printOptions.push('-ArgumentList "-Duplex TwoSidedLongEdge"');
        }
      } else {
        printOptions.push('-ArgumentList "-Duplex OneSided"');
      }
      if (print.orientation === Orientation.SIDEWAYS) {
        printOptions.push('-ArgumentList "-Orientation Landscape"');
      } else {
        printOptions.push('-ArgumentList "-Orientation Portrait"');
      }
      if (print.pageLayout === PageLayout.BOOKLET) {
        printOptions.push('-ArgumentList "-Booklet"');
      }
      if (print.pagesToPrint !== 'all') {
        printOptions.push(`-ArgumentList "-PrintRange ${print.pagesToPrint}"`);
      }
      printOptions.push(`-ArgumentList "-Copies ${print.copies}"`);

      if (!print.fileName?.toLowerCase().endsWith('.pdf')) {
        tempPdfPath = await this.convertToPdf(filePath, print.fileName || '');
        if (tempPdfPath) {
          filePath = tempPdfPath;
        } else {
          throw new Error('PDF conversion failed: No output file produced');
        }
      }

      const psCommand = `Start-Process -FilePath "${filePath}" -Verb Print ${printOptions.join(' ')} -NoNewWindow -Wait`;
      this.logger.log(`Executing PowerShell command: ${psCommand}`);
      const { stderr } = await execPromise(`powershell -Command "${psCommand}"`);
      if (stderr) {
        this.logger.error(`PowerShell print error: ${stderr}`);
        throw new Error(`PowerShell print failed: ${stderr}`);
      }

      const jobCommand = `Get-PrintJob -PrinterName "${print.printer}" | Sort-Object SubmittedTime | Select-Object -Last 1 -ExpandProperty JobId`;
      const { stdout: jobStdout } = await execPromise(`powershell -Command "${jobCommand}"`);
      const jobId = jobStdout.trim();
      this.logger.log(`Print job ${jobId} sent to printer ${print.printer}`);

      void this.updatePrintStatus(
        print._id.toString(),
        PrintJobStatus.PROCESSING,
        jobId,
        new Date(),
        undefined,
        undefined,
      );
      this.monitorPrintJob(print, jobId);
    } catch (error: unknown) {
      const errorMessage = (error instanceof Error) ? error.message : 'Unknown error occurred';
      this.logger.error(`Failed to send to printer: ${errorMessage}`);
      void this.updatePrintStatus(print._id.toString(), PrintJobStatus.ABORTED, undefined, null, errorMessage);
    } finally {
      if (tempPdfPath && await fs.access(tempPdfPath).then(() => true).catch(() => false)) {
        await fs.unlink(tempPdfPath).catch(err => this.logger.error(`Failed to delete temporary file ${tempPdfPath}: ${err}`));
      }
    }
  }

  private getFileExtension(fileType: string): string {
    const normalizedFileType = fileType?.toLowerCase().trim();
    if (!VALID_FILE_TYPES.includes(normalizedFileType as FileType)) {
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
        throw new BadRequestException(`Invalid file type: ${normalizedFileType}`);
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
          status === PrintJobStatus.ABORTED || status === PrintJobStatus.COMPLETED ? timestamp.toISOString() : undefined;
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

  private async getJobPageCount(jobId: string, printerName: string): Promise<number> {
    try {
      const command = `Get-PrintJob -PrinterName "${printerName}" -ID ${jobId} | Select-Object -ExpandProperty TotalPages`;
      this.logger.log(`Executing PowerShell command: ${command}`);
      const { stdout, stderr } = await execPromise(`powershell -Command "${command}"`);
      if (stderr) {
        this.logger.error(`Get-PrintJob error: ${stderr}`);
        return 0;
      }
      const totalPages = parseInt(stdout.trim(), 10);
      if (isNaN(totalPages)) {
        this.logger.warn(`No valid page count for job ${jobId}`);
        return 0;
      }
      this.logger.log(`Page count for job ${jobId}: ${totalPages}`);
      return totalPages;
    } catch (error) {
      this.logger.error(`Failed to get page count: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return 0;
    }
  }

  private async processJobStatus(
    print: PrintDocument,
    jobId: string,
    checkStatus: () => void,
  ): Promise<void> {
    try {
      const command = `Get-PrintJob -PrinterName "${print.printer}" -ID ${jobId} | Select-Object JobStatus,TotalPages | ConvertTo-Json`;
      this.logger.log(`Executing PowerShell command: ${command}`);
      const { stdout, stderr } = await execPromise(`powershell -Command "${command}"`);
      if (stderr) {
        this.logger.error(`Get-PrintJob error: ${stderr}`);
        await this.updatePrintStatus(print._id.toString(), PrintJobStatus.ABORTED, undefined, null, stderr);
        return;
      }

      // Explicitly type the JSON output
      const jobInfo: { JobStatus: string; TotalPages: string } = JSON.parse(stdout.trim()) as { JobStatus: string; TotalPages: string };
      const jobStatus = jobInfo.JobStatus?.toLowerCase() || 'unknown';
      const pagesCompleted = parseInt(jobInfo.TotalPages || '0', 10);

      let status: PrintJobStatus;
      switch (jobStatus) {
        case 'printing':
        case 'spooling':
          status = PrintJobStatus.PROCESSING;
          break;
        case 'completed':
          status = PrintJobStatus.COMPLETED;
          break;
        case 'error':
        case 'paused':
        case 'deleting':
          status = PrintJobStatus.ABORTED;
          break;
        default:
          status = PrintJobStatus.PENDING;
      }

      let calculatedPagesPrinted = 0;
      if (status === PrintJobStatus.COMPLETED) {
        calculatedPagesPrinted = pagesCompleted > 0 ? pagesCompleted * print.copies : await this.getJobPageCount(jobId, print.printer);
        this.logger.log(`Pages printed for job ${jobId}: ${calculatedPagesPrinted} (copies: ${print.copies})`);
      }

      await this.updatePrintStatus(
        print._id.toString(),
        status,
        jobId,
        status === PrintJobStatus.COMPLETED || status === PrintJobStatus.ABORTED ? new Date() : null,
        status === PrintJobStatus.ABORTED ? `Job status: ${jobStatus}` : undefined,
        status === PrintJobStatus.COMPLETED ? calculatedPagesPrinted : undefined,
      );

      if (status !== PrintJobStatus.ABORTED && status !== PrintJobStatus.COMPLETED) {
        setTimeout(checkStatus, 3000);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Job status check failed: ${errorMessage}`);
      await this.updatePrintStatus(print._id.toString(), PrintJobStatus.ABORTED, undefined, null, errorMessage);
    }
  }

  monitorPrintJob(print: PrintDocument, jobId: string): void {
    const checkStatus = () => {
      void this.processJobStatus(print, jobId, checkStatus);
    };
    checkStatus();
  }
}