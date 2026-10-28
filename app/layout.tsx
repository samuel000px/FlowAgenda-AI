import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowAgenda-AI · Administração",
  description: "Agenda, atendimento e gestão da sua esmalteria.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">{children}</body>
    </html>
  );
}
