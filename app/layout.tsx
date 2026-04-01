import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "squishy — 스트레스 풀기",
  description: "회원가입 없이 바로 스퀴시. 누르고, 늘리고, 터뜨려봐!",
  openGraph: {
    title: "squishy",
    description: "누르고 늘리고 터뜨리는 스트레스 해소 앱",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-transparent antialiased">
        {children}
      </body>
    </html>
  );
}
