import React from 'react';
import { Screen } from '../types';

interface TopHeaderProps {
  title: string;
  onNavigate?: (screen: Screen | any) => void;
  leftElement?: React.ReactNode;
  rightElement?: React.ReactNode;
}

export default function TopHeader({ title, leftElement, rightElement }: TopHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6 relative z-10">
      <div className="w-10 flex justify-start items-center">
        {leftElement}
      </div>

      <div className="flex flex-col items-center">
        <h1 className="text-gray-900 dark:text-neutral-100 font-semibold text-base tracking-tight leading-tight">{title}</h1>
      </div>
      
      <div className="w-10 flex justify-end items-center">
        {rightElement}
      </div>
    </div>
  );
}
