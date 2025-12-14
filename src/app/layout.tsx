import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className="min-h-screen bg-neutral-950 text-neutral-50">
        <div className="mx-auto max-w-md p-4">{children}</div>
      </body>
    </html>
  );
}
