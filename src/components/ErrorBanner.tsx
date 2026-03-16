// src/components/ErrorBanner.tsx
"use client";

import { AlertTriangle, X } from "lucide-react";

interface ErrorBannerProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div className="bg-orange-50 border-b border-orange-200 px-4 py-2 flex items-center gap-2 text-sm text-orange-700 font-body animate-fade-in">
      <AlertTriangle className="w-4 h-4 shrink-0 text-orange-500" />
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="w-5 h-5 flex items-center justify-center text-orange-400 hover:text-orange-700 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
