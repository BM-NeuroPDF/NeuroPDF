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
      className="border rounded-xl overflow-hidden shadow-lg cursor-move transition-shadow hover:shadow-2xl flex-shrink-0 touch-none"
    >
      <div
        className="w-[190px]"
        style={{
          backgroundColor: 'var(--container-bg)',
          borderColor: 'var(--container-border)',
          color: 'var(--foreground)',
        }}
      >
        <div
          className="text-center text-xs py-2 border-b font-bold tracking-wide truncate px-1 select-none"
          style={{
            backgroundColor: 'var(--background)',
            borderColor: 'var(--navbar-border)',
          }}
        >
          {t('orderIndex')}: {index + 1} ({t('origPage')} {pageNumber})
        </div>

        <div className="flex justify-center bg-gray-200 dark:bg-gray-800 p-2 h-[240px] items-center overflow-hidden">
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
