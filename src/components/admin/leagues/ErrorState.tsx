"use client";

type ErrorStateProps = {
  message: string;
};

export function ErrorState({ message }: ErrorStateProps) {
  return (
    <div className="rounded-2xl border-4 border-red-500 bg-red-100 p-8 text-center shadow-[6px_6px_0px_0px_rgba(0,0,0,1)]">
      <div className="text-6xl mb-4">❌</div>
      <h2 className="text-2xl font-black text-red-800 mb-2">Hata Oluştu!</h2>
      <p className="text-red-600">{message}</p>
    </div>
  );
}

