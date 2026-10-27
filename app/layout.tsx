import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Encaixa · Agenda que conversa",
  description: "Gerencie presenças, converse com o agente e recupere horários na esmalteria.",
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
