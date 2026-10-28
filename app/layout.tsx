import type { Metadata } from "next";
import "./globals.css";
import "./staff.css";

export const metadata: Metadata = {
  title: "Santa Cor Esmalteria",
  description: "Agendamentos e atendimento da Santa Cor Esmalteria.",
  icons: {
    icon: "/logo-sc.png",
    shortcut: "/logo-sc.png",
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
