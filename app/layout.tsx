import "./globals.css";
import Shell from "./shell";

export const metadata = { title: "ERE Homes · WhatsApp Console", description: "ERE Homes WhatsApp inbox, templates, campaigns & billing" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
