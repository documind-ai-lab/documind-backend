import { Injectable } from "@nestjs/common";
import {
  DocumentSecurityScanInput,
  DocumentSecurityScanResult,
  DocumentSecurityScanner
} from "../application/document-security-scanner";

@Injectable()
export class NoopDocumentSecurityScanner implements DocumentSecurityScanner {
  async scan(_input: DocumentSecurityScanInput): Promise<DocumentSecurityScanResult> {
    return { status: "clean" };
  }
}
