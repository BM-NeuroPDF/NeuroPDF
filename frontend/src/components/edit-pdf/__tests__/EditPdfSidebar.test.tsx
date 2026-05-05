import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DropzoneRootProps } from 'react-dropzone';
import EditPdfSidebar from '../EditPdfSidebar';

const noopRootProps = (() => ({})) as <T extends DropzoneRootProps>(props?: T) => T;

const t = (k: string) => k;

describe('EditPdfSidebar', () => {
  it('renders usage banner for guests when usageInfo is set', () => {
    render(
      <EditPdfSidebar
        title="Edit"
        session={null}
        usageInfo={{
          can_use: true,
          usage_count: 1,
          remaining_usage: 2,
          message: 'Guest msg',
        }}
        showLimitModal={false}
        currentError={null}
        getRootProps={noopRootProps}
        getInputProps={() => ({})}
        isDragActive={false}
        onDropFromPanel={vi.fn()}
        onFileInputChange={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('Guest msg')).toBeInTheDocument();
  });

  it('renders error box when currentError is set', () => {
    render(
      <EditPdfSidebar
        title="Edit"
        session={null}
        usageInfo={null}
        showLimitModal={false}
        currentError="bad"
        getRootProps={noopRootProps}
        getInputProps={() => ({})}
        isDragActive={false}
        onDropFromPanel={vi.fn()}
        onFileInputChange={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByText('bad')).toBeInTheDocument();
  });
});
