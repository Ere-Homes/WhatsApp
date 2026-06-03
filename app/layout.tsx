import Nav from "./nav";

export const metadata = { title: "ERE WhatsApp", description: "ERE Homes WhatsApp inbox" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "Arial, Helvetica, sans-serif",
          background: "#ECEAE5",
          color: "#1F1C17",
          height: "100vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Nav />
        <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>{children}</div>
      </body>
    </html>
  );
}
