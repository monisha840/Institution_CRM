import "./globals.css";

export const metadata = {
  title: "Sirah_CRM",
  description: "School ERP & CRM control tower — multi-school trust for admin, principal, teacher and parent views.",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* One premium sans across the product (Inter, variable weights so
            450/550 land on real instances) plus a mono cut reserved for
            figures — ids, currency, tabular table columns. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;550;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#f6f7f9" />
      </head>
      <body className="paper">{children}</body>
    </html>
  );
}
