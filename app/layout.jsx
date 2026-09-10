import "./globals.css";

export const metadata = {
  // Deliberately the product name, not an institution's — one deployment
  // serves both the school and the college, and the browser tab should not
  // claim to be whichever one you happen to be signed in to.
  title: "Sirah CRM",
  description:
    "School and college ERP — admissions, fees, attendance, examinations, transport and parent communication in one system.",
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
