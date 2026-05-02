import { useCallback } from 'react';
import { PDFDocument } from 'pdf-lib';
import { toast } from 'sonner';

type UsePdfClientActionsParams<K extends string> = {
  pdfFile: File | null;
  pdfList: File[];
  savePdf: (file: File | null) => Promise<void>;
  clearPdf: () => void;
  t: (key: K) => string;
};

export function usePdfClientActions<K extends string>({
  pdfFile,
  pdfList,
  savePdf,
  clearPdf,
  t,
}: UsePdfClientActionsParams<K>) {
  const handleExtractPagesLocal = useCallback(
    async (startPage: number | undefined, endPage: number | undefined) => {
      if (startPage == null || endPage == null) {
        toast.error(t('toastInvalidRange' as K));
        return;
      }
      if (!pdfFile) {
        toast.error(t('toastPdfRequired' as K));
        return;
      }
      if (startPage < 1 || endPage < 1 || endPage < startPage) {
        toast.error(t('toastPagesInvalid' as K));
        return;
      }
      try {
        const buffer = await pdfFile.arrayBuffer();
        const src = await PDFDocument.load(buffer);
        const pageCount = src.getPageCount();
        if (startPage > pageCount || endPage > pageCount) {
          toast.error(
            t('toastPdfLimit' as K).replace('{count}', pageCount.toString())
          );
          return;
        }
        const dest = await PDFDocument.create();
        const indices: number[] = [];
        for (let p = startPage - 1; p <= endPage - 1; p++) {
          indices.push(p);
        }
        const copied = await dest.copyPages(src, indices);
        copied.forEach((page) => dest.addPage(page));
        const outBytes = await dest.save();
        const base = pdfFile.name.replace(/\.pdf$/i, '') || 'document';
        const outName = `${base}_extracted.pdf`;
        const outFile = new File([new Uint8Array(outBytes)], outName, {
          type: 'application/pdf',
        });
        await savePdf(outFile);
        toast.success(t('toastExtractSuccess' as K));
      } catch (e) {
        console.error('EXTRACT_PAGES_LOCAL:', e);
        toast.error(t('toastExtractError' as K));
      }
    },
    [pdfFile, savePdf, t]
  );

  const handleMergePdfsLocal = useCallback(async () => {
    if (pdfList.length < 2) {
      toast.error(t('toastMergeMinFiles' as K));
      return;
    }
    try {
      const mergedPdf = await PDFDocument.create();
      for (const file of pdfList) {
        const buffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(buffer);
        const indices = pdf.getPageIndices();
        const copied = await mergedPdf.copyPages(pdf, indices);
        copied.forEach((page) => mergedPdf.addPage(page));
      }
      const outBytes = await mergedPdf.save();
      const outFile = new File(
        [new Uint8Array(outBytes)],
        'merged_document.pdf',
        {
          type: 'application/pdf',
        }
      );
      await savePdf(outFile);
      toast.success(t('toastMergeSuccess' as K));
    } catch (e) {
      console.error('MERGE_PDFS_LOCAL:', e);
      toast.error(t('toastMergeError' as K));
    }
  }, [pdfList, savePdf, t]);

  const handleClearAllPdfs = useCallback(() => {
    clearPdf();
    toast.info(t('toastClearSuccess' as K));
  }, [clearPdf, t]);

  const handleSwapPagesLocal = useCallback(
    async (pageA: number, pageB: number) => {
      if (!pdfFile) {
        toast.error(t('toastPdfRequired' as K));
        return;
      }
      if (pageA < 1 || pageB < 1 || pageA === pageB) {
        toast.error(t('toastPagesInvalid' as K));
        return;
      }
      try {
        const buffer = await pdfFile.arrayBuffer();
        const src = await PDFDocument.load(buffer);
        const pageCount = src.getPageCount();
        if (pageA > pageCount || pageB > pageCount) {
          toast.error(
            t('toastPdfLimit' as K).replace('{count}', pageCount.toString())
          );
          return;
        }
        const order = Array.from({ length: pageCount }, (_, i) => i + 1);
        const ia = pageA - 1;
        const ib = pageB - 1;
        const next = [...order];
        [next[ia], next[ib]] = [next[ib], next[ia]];
        const dest = await PDFDocument.create();
        const copied = await dest.copyPages(
          src,
          next.map((o) => o - 1)
        );
        copied.forEach((page) => dest.addPage(page));
        const outBytes = await dest.save();
        const outFile = new File([new Uint8Array(outBytes)], pdfFile.name, {
          type: 'application/pdf',
        });
        await savePdf(outFile);
        toast.success(t('toastSwapSuccess' as K));
      } catch (e) {
        console.error('SWAP_PAGES_LOCAL:', e);
        toast.error(t('toastSwapError' as K));
      }
    },
    [pdfFile, savePdf, t]
  );

  const applyClientActions = useCallback(
    async (actions: unknown) => {
      if (!Array.isArray(actions)) return;
      for (const raw of actions) {
        if (!raw || typeof raw !== 'object') continue;
        const action = raw as { type?: string; payload?: unknown };
        if (
          action.type === 'EXTRACT_PAGES_LOCAL' &&
          action.payload &&
          typeof action.payload === 'object'
        ) {
          const pl = action.payload as {
            start_page?: number;
            end_page?: number;
          };
          await handleExtractPagesLocal(pl.start_page, pl.end_page);
        }
        if (action.type === 'MERGE_PDFS_LOCAL') {
          await handleMergePdfsLocal();
        }
        if (action.type === 'CLEAR_ALL_PDFS') {
          handleClearAllPdfs();
        }
        if (
          action.type === 'SWAP_PAGES_LOCAL' &&
          action.payload &&
          typeof action.payload === 'object'
        ) {
          const pl = action.payload as { page_a?: number; page_b?: number };
          await handleSwapPagesLocal(Number(pl.page_a), Number(pl.page_b));
        }
      }
    },
    [
      handleClearAllPdfs,
      handleExtractPagesLocal,
      handleMergePdfsLocal,
      handleSwapPagesLocal,
    ]
  );

  return {
    handleExtractPagesLocal,
    handleMergePdfsLocal,
    handleClearAllPdfs,
    handleSwapPagesLocal,
    applyClientActions,
  };
}
