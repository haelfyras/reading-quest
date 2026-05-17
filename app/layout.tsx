import type { Metadata } from "next";
import { COMPANY_NAME, PRODUCT_NAME, PRODUCT_VERSION } from "../lib/product";
import AppMenu from "./components/AppMenu";
import AppTelemetry from "./components/AppTelemetry";
import FeedbackButton from "./components/FeedbackButton";
import "./globals.css";

export const metadata: Metadata = {
  title: `${PRODUCT_NAME} ${PRODUCT_VERSION}`,
  description: `${PRODUCT_NAME} by ${COMPANY_NAME}: AI-generated book quizzes with points, prizes, and leaderboards.`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const savedTheme = localStorage.getItem('readingQuestTheme');
                const normalizedTheme = savedTheme === 'horror' ? 'spooky' : savedTheme;
                const theme = ['fantasy', 'sci-fi', 'spooky', 'library'].includes(normalizedTheme || '') ? normalizedTheme : 'library';
                const darkMode = localStorage.getItem('readingQuestDarkMode') === 'true';
                const fontSize = localStorage.getItem('readingQuestFontSize') || '16';
                const panelOpacity = localStorage.getItem('readingQuestPanelOpacity') || localStorage.getItem('readingQuestFantasyPanelOpacity') || '80';
                const parsedPanelOpacity = Number(panelOpacity);
                const safePanelOpacity = Number.isFinite(parsedPanelOpacity) ? Math.min(100, Math.max(20, parsedPanelOpacity)) : 80;
                document.documentElement.setAttribute('data-theme-style', theme);
                document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
                document.documentElement.style.setProperty('--font-size-base', fontSize + 'px');
                document.documentElement.style.setProperty('--theme-panel-opacity', String(safePanelOpacity / 100));
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <AppTelemetry />
        <AppMenu />
        {children}
        <FeedbackButton />
        <footer className="product-footer" aria-label="Product information">
          <span>{PRODUCT_NAME} {PRODUCT_VERSION}</span>
          <span>Built by {COMPANY_NAME}</span>
        </footer>
      </body>
    </html>
  );
}
