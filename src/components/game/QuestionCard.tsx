"use client";

export function QuestionCard({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-neutral-900 p-4 text-base leading-relaxed">
      {text}
    </div>
  );
}
