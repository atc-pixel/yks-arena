/**
 * Results Header Component
 * 
 * Architecture Decision:
 * - Results header ayrı component'e taşındı
 * - Reusable ve test edilebilir
 */

type Props = {
  title: string;
  subtitle: string;
};

export function ResultsHeader({ title, subtitle }: Props) {
  return (
    <div className="mb-6">
      <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-neutral-300">{subtitle}</p>
    </div>
  );
}

