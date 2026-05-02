import { useCallback } from 'react';
import { useDropzone, DropzoneOptions, FileRejection } from 'react-dropzone';
import { usePdf } from '@/context/PdfContext';

/**
 * Unified PDF drop hook
 * - Works with native desktop drag-and-drop via react-dropzone
 * - Also supports dragging from the in-app side panel by detecting a custom MIME flag
 *
 * Usage:
 * const { getRootProps, getInputProps, isDragActive } = useUnifiedPdfDrop({
 *   options: { multiple: false, accept: { 'application/pdf': ['.pdf'] }, maxSize },
 *   onFiles: (files, rejections) => { ... existing page logic ... }
 * });
 *
 * Spread getRootProps/getInputProps on your drop area. The hook ensures that
 * panel-origin drops are captured and forwarded to onFiles([pdfFile]).
 */
export function useUnifiedPdfDrop({
  options,
  onFiles,
}: {
  options: DropzoneOptions;
  onFiles: (files: File[], rejections: FileRejection[]) => void;
}) {
  const { pdfFile, pdfList } = usePdf();

  // Wrap dropzone onDrop to delegate to consumer-provided handler
  const onDrop = useCallback(
    (acceptedFiles: File[], fileRejections: FileRejection[]) => {
      onFiles(acceptedFiles, fileRejections);
    },
    [onFiles]
  );

  const {
    getRootProps: _getRootProps,
    getInputProps,
    isDragActive,
  } = useDropzone({
    ...options,
    onDrop,
  });

  // Enhance root props to support panel-origin drops via custom MIME flag
  const getRootProps = useCallback(
    (...args: Parameters<typeof _getRootProps>) => {
      const base = _getRootProps(...args);

      return {
        ...base,
        onDragOverCapture: (e: React.DragEvent) => {
          base.onDragOverCapture?.(
            e as unknown as React.DragEvent<HTMLElement>
          );
          // Allow drop for both native and panel-origin drags
          e.preventDefault();
          try {
            const types = Array.from(e.dataTransfer?.types || []);
            if (types.includes('application/x-neuro-pdf')) {
              e.dataTransfer.dropEffect = 'copy';
            }
          } catch {}
        },
        onDropCapture: (e: React.DragEvent) => {
          // If panel-origin flag is present, forward the context pdfFile to consumer
          try {
            const raw = e.dataTransfer?.getData('application/x-neuro-pdf');
            if (raw) {
              // Stop default bubbling so react-dropzone doesn't override this
              e.preventDefault();
              e.stopPropagation();

              let toForward: File | null = pdfFile;
              try {
                const meta = JSON.parse(raw) as { name?: string };
                if (meta?.name) {
                  const fromList = pdfList.find((x) => x.name === meta.name);
                  if (fromList) toForward = fromList;
                }
              } catch {
                /* keep pdfFile */
              }

              if (toForward) {
                onFiles([toForward], []);
                return;
              }
            }
          } catch {}

          // Fallback to user-provided handler
          base.onDropCapture?.(e as unknown as React.DragEvent<HTMLElement>);
        },
      } as typeof base;
    },
    [_getRootProps, onFiles, pdfFile, pdfList]
  );

  return { getRootProps, getInputProps, isDragActive };
}
