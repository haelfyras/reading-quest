import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reading Quest",
  description: "AI-generated book quizzes for kids with points by difficulty.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const theme = localStorage.getItem('readingQuestTheme') || 'fantasy';
                const darkMode = localStorage.getItem('readingQuestDarkMode') === 'true';
                const fontSize = localStorage.getItem('readingQuestFontSize') || '16';
                document.documentElement.setAttribute('data-theme-style', theme);
                document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
                document.documentElement.style.setProperty('--font-size-base', fontSize + 'px');
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
