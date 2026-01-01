import "./globals.css";

/**
 * Root Layout
 * 
 * Architecture Decision:
 * - suppressHydrationWarning: Browser extension'ları (Grammarly, etc.) 
 *   body'ye attribute ekliyor, bu hydration mismatch'e sebep oluyor
 *   Bu zararsız bir uyarı, suppress ediyoruz
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-dvh bg-neutral-950 text-neutral-50" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
