import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readAllFiles(dirPath, extensions) {
  assert.ok(fs.existsSync(dirPath), `Expected directory to exist: ${dirPath}`);
  const contents = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      contents.push(...readAllFiles(fullPath, extensions));
    } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
      contents.push(fs.readFileSync(fullPath, "utf8"));
    }
  }

  return contents.join("\n");
}

test("GitHub Pages workflow builds dist-site and deploys via official Pages actions", () => {
  const workflowPath = ".github/workflows/pages.yml";
  assert.ok(fs.existsSync(workflowPath), `Missing ${workflowPath}`);
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /uses:\s*actions\/configure-pages@v5\b/);
  assert.match(workflow, /pnpm run build:site/);
  assert.match(
    workflow,
    /uses:\s*actions\/upload-pages-artifact@v3[\s\S]*?path:\s*['"]?\.\/dist-site['"]?/,
  );
  assert.match(workflow, /uses:\s*actions\/deploy-pages@v4\b/);
});

test("vite.site.config.ts configures /QuotaShift/ base, dist-site output, and Tauri shims", () => {
  const configPath = "vite.site.config.ts";
  assert.ok(fs.existsSync(configPath), `Missing ${configPath}`);
  const config = fs.readFileSync(configPath, "utf8");

  assert.match(config, /["']\/QuotaShift\/["']/);
  assert.match(config, /["']dist-site["']/);
  assert.match(config, /@tauri-apps\\\/api|@tauri-apps\/api/);
  assert.match(config, /@tauri-apps\\\/plugin-|@tauri-apps\/plugin-/);
});

test("site components link to QuotaShift repo, author profile, and latest releases", () => {
  const componentsSource = readAllFiles(path.join("site", "components"), [".ts", ".tsx"]);

  assert.match(componentsSource, /https:\/\/github\.com\/the-long-ride\/QuotaShift(?=["'\s/]|$)/);
  assert.match(componentsSource, /https:\/\/github\.com\/the-long-ride(?=["'\s]|$)/);
  assert.match(
    componentsSource,
    /https:\/\/github\.com\/the-long-ride\/QuotaShift\/releases\/latest/,
  );
});

test("site demo components import real Tauri UI components", () => {
  const demoSource = readAllFiles(path.join("site", "components", "demo"), [".ts", ".tsx"]);
  const requiredComponents = [
    "Header",
    "AppTabBar",
    "AntigravityTab",
    "CodexTab",
    "ClaudeTab",
    "OverlayCardStack",
    "OverlayCircleStack",
    "TaskbarColumn",
    "TaskbarTooltipCard",
  ];

  for (const componentName of requiredComponents) {
    assert.match(
      demoSource,
      new RegExp(`import\\s+[^;]*\\b${componentName}\\b[^;]*from\\s+["'][^"']*src/components/`),
      `Expected site/components/demo/ to import ${componentName} from src/components/`,
    );
  }
});

test("site-layout.css overrides html.qs-site overflow to allow vertical scrolling", () => {
  const layoutCssPath = path.join("site", "styles", "site-layout.css");
  assert.ok(fs.existsSync(layoutCssPath), `Missing ${layoutCssPath}`);
  const layoutCss = fs.readFileSync(layoutCssPath, "utf8");

  assert.match(layoutCss, /html\.qs-site[\s\S]*?overflow-y:\s*auto\b/);
});

test("VS Code launch config uses node-terminal for Launch QuotaShift Web Page without unused site dev task", () => {
  const launchPath = path.join(".vscode", "launch.json");
  const tasksPath = path.join(".vscode", "tasks.json");
  assert.ok(fs.existsSync(launchPath), `Missing ${launchPath}`);
  assert.ok(fs.existsSync(tasksPath), `Missing ${tasksPath}`);

  const launchConfig = JSON.parse(fs.readFileSync(launchPath, "utf8"));
  const tasksConfig = JSON.parse(fs.readFileSync(tasksPath, "utf8"));

  const webLaunch = launchConfig.configurations.find(
    (cfg) => cfg.name === "Launch QuotaShift Web Page",
  );
  assert.ok(webLaunch, 'Expected "Launch QuotaShift Web Page" in .vscode/launch.json');
  assert.equal(webLaunch.type, "node-terminal");
  assert.equal(webLaunch.request, "launch");
  assert.equal(webLaunch.cwd, "${workspaceFolder}");
  assert.equal(webLaunch.command, "pnpm exec vite --config vite.site.config.ts --open");

  const chromeLaunch = launchConfig.configurations.find(
    (cfg) => cfg.type === "chrome" && cfg.request === "launch",
  );
  assert.equal(chromeLaunch, undefined, 'Expected no "chrome" launch configuration');

  const siteDevTask = tasksConfig.tasks.find((task) => task.label === "site dev");
  assert.equal(siteDevTask, undefined, 'Expected unused "site dev" task to be removed');
});

test("site demo data and components omit legacy Gemini 4 Argon entries", () => {
  const siteSource = [
    readAllFiles(path.join("site", "data"), [".ts", ".tsx"]),
    readAllFiles(path.join("site", "components"), [".ts", ".tsx"]),
  ].join("\n");

  assert.doesNotMatch(siteSource, /gemini-4-argon/);
  assert.doesNotMatch(siteSource, /family:\s*["']argon["']/);
  assert.doesNotMatch(siteSource, /\bArgon\b/);
});

test("OverlayDemoSurface wires useStageOverlayDrag with translate3d and touch-action: none", () => {
  const hookPath = path.join("site", "hooks", "useStageOverlayDrag.ts");
  const overlayPath = path.join("site", "components", "demo", "OverlayDemoSurface.tsx");
  const stageCssPath = path.join("site", "styles", "site-demo-stage.css");

  assert.ok(fs.existsSync(hookPath), `Missing ${hookPath}`);
  const hookSource = fs.readFileSync(hookPath, "utf8");
  const overlaySource = fs.readFileSync(overlayPath, "utf8");
  const stageCss = fs.readFileSync(stageCssPath, "utf8");

  assert.match(hookSource, /export\s+const\s+DRAG_THRESHOLD_PX\s*=\s*4\b/);
  assert.match(hookSource, /export\s+function\s+useStageOverlayDrag\b/);
  assert.match(overlaySource, /useStageOverlayDrag/);
  assert.match(overlaySource, /translate3d/);
  assert.match(overlaySource, /Reset Position/);
  assert.match(stageCss, /\.qs-overlay-hud-float--draggable[\s\S]*?touch-action:\s*none\b/);
});

test("TaskbarDemoSurface supports 4-edge taskbar docking and site/main.tsx imports site-taskbar-stage.css", () => {
  const taskbarSurfacePath = path.join("site", "components", "demo", "TaskbarDemoSurface.tsx");
  const mainPath = path.join("site", "main.tsx");
  const taskbarCssPath = path.join("site", "styles", "site-taskbar-stage.css");

  assert.ok(fs.existsSync(taskbarSurfacePath), `Missing ${taskbarSurfacePath}`);
  assert.ok(fs.existsSync(mainPath), `Missing ${mainPath}`);

  const taskbarSource = fs.readFileSync(taskbarSurfacePath, "utf8");
  const mainSource = fs.readFileSync(mainPath, "utf8");

  assert.match(
    taskbarSource,
    /import\s*\{[\s\S]*?\bisVerticalTaskbarEdge\b[\s\S]*?\bplacementForTaskbarEdge\b[\s\S]*?\}\s*from\s*["'][^"']*taskbar-panel-placement["']/,
  );
  for (const edge of ["bottom", "top", "left", "right"]) {
    assert.match(
      taskbarSource,
      new RegExp(`["']${edge}["']`),
      `Expected TaskbarDemoSurface to support "${edge}" edge`,
    );
  }
  assert.match(taskbarSource, /vertical=\{vertical\}/);
  assert.match(taskbarSource, /className="taskbar-root"[\s\S]*?data-taskbar-edge=\{edge\}/);
  assert.match(mainSource, /import\s+["']\.\/styles\/site-taskbar-stage\.css["'];/);
  assert.ok(fs.existsSync(taskbarCssPath), `Missing ${taskbarCssPath}`);
});

test("HudDemoContextMenu wraps real OverlayContextMenu with localTooltips and is rendered by Overlay and Taskbar surfaces", () => {
  const menuPath = path.join("site", "components", "demo", "HudDemoContextMenu.tsx");
  const overlayPath = path.join("site", "components", "demo", "OverlayDemoSurface.tsx");
  const taskbarPath = path.join("site", "components", "demo", "TaskbarDemoSurface.tsx");

  assert.ok(fs.existsSync(menuPath), `Missing ${menuPath}`);
  const menuSource = fs.readFileSync(menuPath, "utf8");
  const overlaySource = fs.readFileSync(overlayPath, "utf8");
  const taskbarSource = fs.readFileSync(taskbarPath, "utf8");

  assert.match(
    menuSource,
    /import\s*\{[^}]*\bOverlayContextMenu\b[^}]*\}\s*from\s*["'][^"']*src\/components\/overlay\/tooltip\/OverlayContextMenu["']/,
  );
  assert.match(menuSource, /localTooltips=\{true\}/);

  assert.match(
    overlaySource,
    /import\s*\{[^}]*\bHudDemoContextMenu\b[^}]*\}\s*from\s*["']\.\/HudDemoContextMenu["']/,
  );
  assert.match(overlaySource, /<HudDemoContextMenu\b/);

  assert.match(
    taskbarSource,
    /import\s*\{[^}]*\bHudDemoContextMenu\b[^}]*\}\s*from\s*["']\.\/HudDemoContextMenu["']/,
  );
  assert.match(taskbarSource, /<HudDemoContextMenu\b/);
});

test("SiteHero displays live GitHub release total downloads with Shields fallback", () => {
  const hookPath = path.join("site", "hooks", "useGithubReleaseDownloads.ts");
  const heroPath = path.join("site", "components", "SiteHero.tsx");

  assert.ok(fs.existsSync(hookPath), `Missing ${hookPath}`);
  const hookSource = fs.readFileSync(hookPath, "utf8");
  const heroSource = fs.readFileSync(heroPath, "utf8");

  assert.match(
    hookSource,
    /https:\/\/api\.github\.com\/repos\/the-long-ride\/QuotaShift\/releases/,
  );
  assert.match(hookSource, /\bdownload_count\b/);
  assert.match(
    hookSource,
    /img\.shields\.io\/github\/downloads\/the-long-ride\/QuotaShift\/total\.json/,
  );
  assert.match(hookSource, /export\s+function\s+sumReleaseAssetDownloads\b/);
  assert.match(hookSource, /export\s+function\s+useGithubReleaseDownloads\b/);

  assert.match(
    heroSource,
    /import\s*\{[^}]*\buseGithubReleaseDownloads\b[^}]*\}\s*from\s*["'][^"']*useGithubReleaseDownloads["']/,
  );
  assert.match(heroSource, /data-testid="github-total-downloads"/);
});

test("SiteHighlights action bar renders pill buttons with inline SVG arrows and focus styles", () => {
  const highlightsPath = path.join("site", "components", "SiteHighlights.tsx");
  const layoutCssPath = path.join("site", "styles", "site-layout.css");

  assert.ok(fs.existsSync(highlightsPath), `Missing ${highlightsPath}`);
  assert.ok(fs.existsSync(layoutCssPath), `Missing ${layoutCssPath}`);

  const highlightsSource = fs.readFileSync(highlightsPath, "utf8");
  const layoutCss = fs.readFileSync(layoutCssPath, "utf8");

  assert.doesNotMatch(highlightsSource, /→/);
  assert.match(highlightsSource, /<svg\b/);
  assert.match(highlightsSource, /className="qs-jump-btn-arrow"/);
  assert.match(highlightsSource, /aria-hidden="true"/);

  const jumpBtnRuleMatch = layoutCss.match(/\.qs-jump-btn\s*\{([^}]*)\}/);
  assert.ok(jumpBtnRuleMatch, "Expected .qs-jump-btn rule in site-layout.css");
  const jumpBtnBody = jumpBtnRuleMatch[1];

  assert.match(jumpBtnBody, /\bborder:/);
  assert.match(jumpBtnBody, /\bborder-radius:/);
  assert.doesNotMatch(jumpBtnBody, /\bborder:\s*none;/);
  assert.match(layoutCss, /\.qs-jump-btn:focus-visible\b/);
  assert.match(layoutCss, /\[data-theme="light"\]\s+\.qs-jump-btn:hover\b/);
});

test("SiteNavbar displays live GitHub star count with Shields fallback and site/main.tsx imports site-hero.css", () => {
  const hookPath = path.join("site", "hooks", "useGithubRepoStars.ts");
  const navbarPath = path.join("site", "components", "SiteNavbar.tsx");
  const heroCssPath = path.join("site", "styles", "site-hero.css");
  const mainPath = path.join("site", "main.tsx");

  assert.ok(fs.existsSync(hookPath), `Missing ${hookPath}`);
  assert.ok(fs.existsSync(navbarPath), `Missing ${navbarPath}`);
  assert.ok(fs.existsSync(heroCssPath), `Missing ${heroCssPath}`);
  assert.ok(fs.existsSync(mainPath), `Missing ${mainPath}`);

  const hookSource = fs.readFileSync(hookPath, "utf8");
  const navbarSource = fs.readFileSync(navbarPath, "utf8");
  const mainSource = fs.readFileSync(mainPath, "utf8");

  assert.match(hookSource, /https:\/\/api\.github\.com\/repos\/the-long-ride\/QuotaShift(?=["'`])/);
  assert.match(hookSource, /\bstargazers_count\b/);
  assert.match(hookSource, /img\.shields\.io\/github\/stars\/the-long-ride\/QuotaShift\.json/);
  assert.match(hookSource, /export\s+function\s+parseRepoStargazersCount\b/);
  assert.match(hookSource, /export\s+function\s+useGithubRepoStars\b/);

  assert.match(
    navbarSource,
    /import\s*\{[^}]*\buseGithubRepoStars\b[^}]*\}\s*from\s*["'][^"']*useGithubRepoStars["']/,
  );
  assert.match(navbarSource, /data-testid="github-star-count"/);
  assert.match(navbarSource, /<svg[\s\S]*?className="qs-nav-gh-star-icon"/);
  assert.doesNotMatch(navbarSource, /[★⭐]/);

  assert.match(mainSource, /import\s+["']\.\/styles\/site-hero\.css["'];/);
});

test("Sticky navbar keeps body overflow visible and SiteFooter omits redundant repo and author links", () => {
  const layoutCssPath = path.join("site", "styles", "site-layout.css");
  const footerPath = path.join("site", "components", "SiteFooter.tsx");

  assert.ok(fs.existsSync(layoutCssPath), `Missing ${layoutCssPath}`);
  assert.ok(fs.existsSync(footerPath), `Missing ${footerPath}`);

  const layoutCss = fs.readFileSync(layoutCssPath, "utf8");
  const footerSource = fs.readFileSync(footerPath, "utf8");

  assert.match(layoutCss, /html\.qs-site\s+body\s*\{[^}]*overflow:\s*visible\s*!important/);

  const navbarRuleMatch = layoutCss.match(/\.qs-navbar\s*\{([^}]*)\}/);
  assert.ok(navbarRuleMatch, "Expected .qs-navbar rule in site-layout.css");
  assert.match(navbarRuleMatch[1], /position:\s*sticky/);
  assert.match(navbarRuleMatch[1], /top:\s*0/);

  assert.doesNotMatch(footerSource, /GitHub Repository/);
  assert.doesNotMatch(footerSource, /@the-long-ride/);
  assert.match(footerSource, /Latest Release/);
  assert.match(footerSource, /https:\/\/github\.com\/the-long-ride\/QuotaShift\/releases\/latest/);
});

test("OverlayDemoSurface renders real TaskbarTooltipCard on hover and SiteNavbar places theme toggle rightmost", () => {
  const hookPath = path.join("site", "hooks", "useStageOverlayTooltip.ts");
  const overlayPath = path.join("site", "components", "demo", "OverlayDemoSurface.tsx");
  const stageCssPath = path.join("site", "styles", "site-demo-stage.css");
  const navbarPath = path.join("site", "components", "SiteNavbar.tsx");

  assert.ok(fs.existsSync(hookPath), `Missing ${hookPath}`);
  assert.ok(fs.existsSync(overlayPath), `Missing ${overlayPath}`);
  assert.ok(fs.existsSync(stageCssPath), `Missing ${stageCssPath}`);
  assert.ok(fs.existsSync(navbarPath), `Missing ${navbarPath}`);

  const hookSource = fs.readFileSync(hookPath, "utf8");
  const overlaySource = fs.readFileSync(overlayPath, "utf8");
  const stageCss = fs.readFileSync(stageCssPath, "utf8");
  const navbarSource = fs.readFileSync(navbarPath, "utf8");

  assert.match(
    hookSource,
    /import\s*\{[^}]*\bbuildTaskbarColumns\b[^}]*\}\s*from\s*["'][^"']*src\/utils\/common\/ui\/taskbar-columns["']/,
  );
  assert.match(
    hookSource,
    /import\s*\{[^}]*\bcomputeAnchoredPanelPosition\b[^}]*\}\s*from\s*["'][^"']*src\/utils\/common\/ui\/taskbar-panel-placement["']/,
  );
  assert.match(hookSource, /export\s+function\s+useStageOverlayTooltip\b/);

  assert.match(
    overlaySource,
    /import\s*\{[^}]*\bTaskbarTooltipCard\b[^}]*\}\s*from\s*["'][^"']*src\/components\/taskbar\/TaskbarTooltipCard["']/,
  );
  assert.match(
    overlaySource,
    /import\s*\{[^}]*\buseStageOverlayTooltip\b[^}]*\}\s*from\s*["'][^"']*useStageOverlayTooltip["']/,
  );
  assert.match(overlaySource, /taskbar-tooltip-root[\s\S]*?<TaskbarTooltipCard\b/);
  assert.doesNotMatch(overlaySource, /qs-overlay-hover-preview/);
  assert.doesNotMatch(overlaySource, /\bsummarizeCard\b/);

  assert.doesNotMatch(stageCss, /\.qs-overlay-hover-preview\b/);
  assert.match(stageCss, /\.qs-overlay-tooltip-anchor\s*\{[^}]*pointer-events:\s*none/);

  assert.ok(
    navbarSource.indexOf("qs-nav-github-btn") > -1 &&
      navbarSource.indexOf("onClick={onToggleTheme}") > -1 &&
      navbarSource.indexOf("qs-nav-github-btn") < navbarSource.indexOf("onClick={onToggleTheme}"),
    "Expected SiteNavbar theme toggle button to appear after .qs-nav-github-btn",
  );
});

test("Navbar left-aligns primary nav links next to brand and pushes nav actions right", () => {
  const layoutCss = fs.readFileSync("site/styles/site-layout.css", "utf8");

  const navbarInnerMatch = layoutCss.match(/\.qs-navbar-inner\s*\{([^}]*)\}/);
  assert.ok(navbarInnerMatch, "Expected .qs-navbar-inner rule in site/styles/site-layout.css");
  assert.doesNotMatch(navbarInnerMatch[1], /justify-content:\s*space-between/);

  const navActionsMatch = layoutCss.match(/\.qs-nav-actions\s*\{([^}]*)\}/);
  assert.ok(navActionsMatch, "Expected .qs-nav-actions rule in site/styles/site-layout.css");
  assert.match(navActionsMatch[1], /margin-left:\s*auto/);
});

test("Dashboard demo confines BackgroundStatusModal inside .qs-demo-window and provides realistic Agent API demo status", () => {
  const viteSiteConfig = fs.readFileSync("vite.site.config.ts", "utf8");
  const agentApiShim = fs.readFileSync("site/shims/demo-agent-api-shim.ts", "utf8");
  const dashSource = fs.readFileSync("site/components/demo/DashboardDemoSurface.tsx", "utf8");
  const demoStageCss = fs.readFileSync("site/styles/site-demo-stage.css", "utf8");

  assert.match(viteSiteConfig, /BackgroundStatusModal\.tsx/);
  assert.match(viteSiteConfig, /\.qs-demo-window/);

  assert.match(agentApiShim, /45692/);
  assert.doesNotMatch(agentApiShim, /port:\s*0\b/);
  for (const cmd of [
    "agent_api_status",
    "agent_api_start",
    "agent_api_stop",
    "agent_api_generate_key",
    "agent_api_list_skills",
  ]) {
    assert.ok(
      agentApiShim.includes(cmd),
      `Expected site/shims/demo-agent-api-shim.ts to handle ${cmd}`,
    );
  }

  assert.match(
    dashSource,
    /<\/div>\s*<Tooltip\s*\/>/,
    "Expected <Tooltip /> to render outside .qs-demo-window",
  );

  const demoWindowMatch = demoStageCss.match(/\.qs-demo-window\s*\{([^}]*)\}/);
  assert.ok(demoWindowMatch, "Expected .qs-demo-window rule in site/styles/site-demo-stage.css");
  assert.match(demoWindowMatch[1], /transform:\s*translateZ\(0\)/);
  assert.match(demoStageCss, /\.qs-demo-window\s+\.bg-status-modal/);
});
