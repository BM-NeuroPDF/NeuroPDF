/**
 * Subset of react-pdf / pdfjs-dist module shape used only for GlobalWorkerOptions.
 */
export type ReactPdfJsWorkerModule = {
  GlobalWorkerOptions: { workerSrc: string };
  version?: string;
};
