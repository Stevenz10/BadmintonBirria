export const metadata = { title: 'Badminton Matcher' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', padding: 20, background: '#fafafa' }}>
        {children}
      </body>
    </html>
  );
}
