import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NeuroLogo from '../NeuroLogo';

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
  }: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
  }) => <img src={src} alt={alt} width={width} height={height} />,
}));

describe('NeuroLogo', () => {
  it('renders icon and text with defaults', () => {
    render(<NeuroLogo />);
    expect(screen.getByAltText(/Neuro PDF Logo/i)).toBeInTheDocument();
    expect(screen.getByText('Neuro')).toBeInTheDocument();
    expect(screen.getByText('PDF')).toBeInTheDocument();
  });

  it('applies custom className and sizes', () => {
    const { container } = render(
      <NeuroLogo className="extra" iconSize={32} textSize="text-2xl" />
    );
    expect(container.firstChild).toHaveClass('extra');
  });
});
