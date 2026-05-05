'use client';

import type { ComponentProps } from 'react';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import type { EditPdfPageItem, EditPdfTranslate } from './editPdfTypes';
import { EditPdfDocument } from './EditPdfDocument';
import { EditPdfSortablePageItem } from './EditPdfSortablePageItem';

type DndSensors = NonNullable<ComponentProps<typeof DndContext>['sensors']>;

type EditPdfCanvasProps = {
  objectUrl: string | null;
  isProcessingDone: boolean;
  pages: EditPdfPageItem[];
  sensors: DndSensors;
  onDragEnd: (event: DragEndEvent) => void;
  onLoadSuccess: (args: { numPages: number }) => void;
  pdfOptions: { cMapUrl: string; cMapPacked: boolean };
  t: EditPdfTranslate;
};

export default function EditPdfCanvas({
  objectUrl,
  isProcessingDone,
  pages,
  sensors,
  onDragEnd,
  onLoadSuccess,
  pdfOptions,
  t,
}: EditPdfCanvasProps) {
  if (!objectUrl || isProcessingDone) return null;

  return (
    <>
      <div className="mt-8">
        <h3 className="text-xl font-semibold mb-4 opacity-90">
          {t('previewDragDrop')} ({pages.length} {t('page')})
        </h3>

        <EditPdfDocument
          key={objectUrl || 'no-url'}
          file={objectUrl}
          onLoadSuccess={onLoadSuccess}
          onLoadError={(error: unknown) => {
            console.error('PDF Document Error:', error);
          }}
          loading={<div className="p-6">{t('loading')}</div>}
          error={<div className="p-6 text-red-500">{t('pdfError')}</div>}
          className="flex justify-center"
          options={pdfOptions}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={pages.map((p) => p.id)} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-4 p-4 justify-start w-full">
                {pages.map((p, index) => (
                  <EditPdfSortablePageItem
                    key={p.id}
                    id={p.id}
                    pageNumber={p.pageNumber}
                    index={index}
                    t={t}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </EditPdfDocument>
      </div>
    </>
  );
}
