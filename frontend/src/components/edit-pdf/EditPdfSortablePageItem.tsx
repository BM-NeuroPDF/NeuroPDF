'use client';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { EditPdfTranslate } from './editPdfTypes';
import { EditPdfPage } from './EditPdfDocument';

export function EditPdfSortablePageItem({
  id,
  pageNumber,
  index,
  t,
}: {
  id: string;
  pageNumber: number;
  index: number;
  t: EditPdfTranslate;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex-shrink-0 cursor-move touch-none overflow-hidden rounded-xl border border-np-outline-variant shadow-lg transition-shadow hover:shadow-2xl"
    >
      <div className="w-[190px] bg-np-surface-container text-np-on-background">
        <div className="truncate border-b border-np-outline-variant bg-np-background px-1 py-2 text-center text-xs font-bold tracking-wide select-none">
          {t('orderIndex')}: {index + 1} ({t('origPage')} {pageNumber})
        </div>

        <div className="flex h-[240px] items-center justify-center overflow-hidden bg-np-surface-container-high p-2">
          <EditPdfPage
            pageNumber={pageNumber}
            width={170}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="shadow-sm pointer-events-none select-none"
          />
        </div>
      </div>
    </div>
  );
}
