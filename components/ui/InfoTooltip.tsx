import React, { useRef, useState } from 'react';

interface InfoTooltipProps {
    text: string;
    alignment?: 'center' | 'left';
    placement?: 'top' | 'bottom';
}

const EDGE_GAP = 8;

// Left and right edges of the nearest ancestor that clips its content, or of the window
const visibleBounds = (el: HTMLElement): { left: number; right: number } => {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (getComputedStyle(node).overflowX !== 'visible') {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right };
    }
  }
  return { left: 0, right: window.innerWidth };
};

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, alignment = 'center', placement = 'top' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  // Horizontal position of the tooltip relative to the icon, kept inside the card and the screen
  const [offset, setOffset] = useState<number | null>(null);
  const measure = () => {
    if (!ref.current || !tipRef.current) return;
    const icon = ref.current.getBoundingClientRect();
    const width = tipRef.current.offsetWidth;
    const preferred = alignment === 'left' ? icon.left - 12 : icon.left + icon.width / 2 - width / 2;
    const bounds = visibleBounds(ref.current);
    const min = bounds.left + EDGE_GAP;
    const max = bounds.right - EDGE_GAP - width;
    const left = max < min ? min : Math.min(Math.max(preferred, min), max);
    setOffset(left - icon.left);
  };

  const isTop = placement === 'top';
  const xPosition = offset === null && alignment !== 'left' ? 'left-1/2 -translate-x-1/2' : '';
  const tipStyle = offset === null ? (alignment === 'left' ? { left: '-0.75rem' } : undefined) : { left: `${offset}px` };
  // The arrow (same width as the icon) points back at the icon
  const arrowStyle = offset === null ? undefined : { left: `${-offset}px` };
  const yPosition = isTop ? 'bottom-full mb-2' : 'top-full mt-2';
  const arrowY = isTop ? 'top-full -mt-px' : 'bottom-full -mb-px rotate-180';

  return (
    // Named group: only this icon opens this tooltip, even inside other .group elements.
    // Focusable so a tap opens it on touch screens and tapping elsewhere closes it.
    // Raised while open so neighbouring icons never draw over the tooltip.
    <div
      ref={ref}
      tabIndex={0}
      role="button"
      aria-label={text}
      onMouseEnter={measure}
      onFocus={measure}
      className="group/tip relative z-10 ml-1.5 inline-flex items-center rounded-full align-middle hover:z-50 focus:z-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 cursor-help text-gray-400 transition-colors group-hover/tip:text-brand-primary group-focus/tip:text-brand-primary">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <span ref={tipRef} style={tipStyle} aria-hidden="true" className={`invisible group-hover/tip:visible group-focus/tip:visible opacity-0 group-hover/tip:opacity-100 group-focus/tip:opacity-100 transition-opacity absolute ${yPosition} w-48 md:w-56 p-3 bg-gray-900 text-white text-xs rounded-md shadow-xl pointer-events-none text-left leading-snug font-normal ${xPosition}`}>
        {text}
        <svg style={arrowStyle} className={`absolute ${arrowY} text-gray-900 h-2 w-4 ${offset === null ? (alignment === 'left' ? 'left-[0.6rem]' : 'left-1/2 -translate-x-1/2') : ''}`} viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0" /></svg>
      </span>
    </div>
  );
};
