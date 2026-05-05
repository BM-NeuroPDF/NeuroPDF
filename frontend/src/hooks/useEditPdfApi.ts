import { sendRequest } from '@/utils/api';

export async function reorderPdfPages(file: File, pageNumbersCsv: string): Promise<Blob> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('page_numbers', pageNumbersCsv);
  return sendRequest<Blob>('/files/reorder', 'POST', formData, true);
}

export async function saveReorderedPdfToServer(
  processed: File,
  filename: string,
): Promise<{ size_kb?: number }> {
  const formData = new FormData();
  formData.append('file', processed);
  formData.append('filename', filename);
  return sendRequest<{ size_kb?: number }>('/files/save-processed', 'POST', formData, true);
}
