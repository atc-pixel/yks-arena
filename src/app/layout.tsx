import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-dvh bg-neutral-950 text-neutral-50">{children}</body>
    </html>
  );
}
