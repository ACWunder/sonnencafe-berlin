// src/components/LoadingState.tsx

interface LoadingStateProps {
  fullscreen?: boolean;
}

export function LoadingState({ fullscreen }: LoadingStateProps) {
  const inner = (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-12 h-12">
        <div className="w-12 h-12 rounded-full border-2 border-sun-200 border-t-sun-500 animate-spin" />
        <span className="absolute inset-0 flex items-center justify-center text-lg">☀️</span>
      </div>
      <p className="text-sm text-stone-400 font-body animate-pulse-soft">
        Lade Cafés aus Wien...
      </p>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="fixed inset-0 bg-stone-50 flex items-center justify-center z-50">
        {inner}
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      {inner}
    </div>
  );
}
