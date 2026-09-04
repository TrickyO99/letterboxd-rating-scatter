import type { Metadata } from "next";
import { Prata, Inter } from "next/font/google";
import "./globals.css";

const prata = Prata({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-prata",
});
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
});

// Same monogram as odtriki.com, so the tab icon reads as the same site family.
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232547e6'/%3E%3Ctext x='10' y='23' font-family='Georgia,serif' font-size='11' fill='%23fbf6ec' text-anchor='middle'%3EO%3C/text%3E%3Ctext x='22' y='13' font-family='Georgia,serif' font-size='11' fill='%23ff6a1f' text-anchor='middle'%3ET%3C/text%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: "Scatterboxd",
  description: "Plot your Letterboxd ratings against the crowd's average, film by film.",
  icons: { icon: FAVICON },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${prata.variable} ${inter.variable}`}>
      <body className="min-h-full flex flex-col">
        <div className="brandbar" />
        <div className="wash" aria-hidden="true" />
        {children}
      </body>
    </html>
  );
}
