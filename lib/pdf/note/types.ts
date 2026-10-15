import type { PinKind } from "./kinds";

export const PINS_API = "/api/pdf/pins";

export type PdfPin = {
  id: number;
  fileName: string;
  type: PinKind;
  pageNumber: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  content: string;
};
