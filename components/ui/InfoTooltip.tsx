import React from 'react';

interface InfoTooltipProps {
    text: string;
    alignment?: 'center' | 'left';
    placement?: 'top' | 'bottom';
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({ text, alignment = 'center', placement = 'top' }) => {
  const isTop = placement === 'top';
  
  const xPosition = alignment === 'left' 
    ? "left-[-0.75rem]" 
    : "left-1/2 -translate-x-1/2";
    
  const arrowX = alignment === 'left'
    ? "left-[0.6rem]"
    : "left-1/2 -translate-x-1/2";

  // Vertical positioning
  const yPosition = isTop 
    ? "bottom-full mb-2" 
    : "top-full mt-2";
    
  const arrowY = isTop 
    ? "top-full -mt-px" 
    : "bottom-full -mb-px rotate-180";

  return (
    // Named group: only this icon opens this tooltip, even inside other .group elements.
    // Focusable so a tap opens it on touch screens and tapping elsewhere closes it.
    <div tabIndex={0} role="button" aria-label={text} className="group/tip relative inline-flex items-center ml-1.5 align-middle z-30 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-400 group-hover/tip:text-brand-primary group-focus/tip:text-brand-primary cursor-help transition-colors">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM8.94 6.94a.75.75 0 11-1.061-1.061 3 3 0 112.871 5.026v.345a.75.75 0 01-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 108.94 6.94zM10 15a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <span aria-hidden="true" className={`invisible group-hover/tip:visible group-focus/tip:visible opacity-0 group-hover/tip:opacity-100 group-focus/tip:opacity-100 transition-opacity absolute ${yPosition} w-48 md:w-56 p-3 bg-gray-900 text-white text-xs rounded-md shadow-xl pointer-events-none text-left leading-snug font-normal ${xPosition}`}>
        {text}
        <svg className={`absolute ${arrowY} text-gray-900 h-2 w-4 ${arrowX}`} viewBox="0 0 255 255"><polygon className="fill-current" points="0,0 127.5,127.5 255,0" /></svg>
      </span>
    </div>
  );
};