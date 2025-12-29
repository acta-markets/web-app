export function ThemeScript() {
  // Runs before React hydration to avoid flash.
  const code = `
(() => {
  try {
    const stored = localStorage.getItem('theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  } catch {}
})();
`.trim();

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}



