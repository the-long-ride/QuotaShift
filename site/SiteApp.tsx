import React, { useEffect } from "react";
import { useDemoCoordinator } from "./hooks/useDemoCoordinator";
import { SiteNavbar } from "./components/SiteNavbar";
import { SiteHero } from "./components/SiteHero";
import { DemoSection } from "./components/demo/DemoSection";
import { SiteHighlights } from "./components/SiteHighlights";
import { SiteFooter } from "./components/SiteFooter";

export const SiteApp: React.FC = () => {
  const coord = useDemoCoordinator();

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", coord.isDarkMode ? "dark" : "light");
  }, [coord.isDarkMode]);

  return (
    <div className="qs-site-root" data-theme={coord.isDarkMode ? "dark" : "light"}>
      <SiteNavbar isDarkMode={coord.isDarkMode} onToggleTheme={coord.onToggleTheme} />
      <main className="qs-main">
        <SiteHero />
        <DemoSection coord={coord} />
        <SiteHighlights coord={coord} />
      </main>
      <SiteFooter />
    </div>
  );
};
