export const studioLayoutKey = 'dreamstream:v04:studio-layout';
export type StudioLayout = { version: 2; mainSplitRatio: number; assetDrawerWidth: number; focus: 'split'|'creative'|'assets'; directorExpanded: boolean };
export const defaultStudioLayout: StudioLayout = { version: 2, mainSplitRatio: 58, assetDrawerWidth: 440, focus: 'split', directorExpanded: false };
export function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), max); }
export function mainBounds(width: number) { return { min: Math.min(45, 300 / width * 100), max: Math.max(55, (width - 260 - 7) / width * 100) }; }
// The Agent header, feed and composer need more than the theoretical 220px
// minimum to remain usable on an ordinary laptop screen.
export function verticalBounds(height: number) { return { min: 220 / height * 100, max: (height - 400 - 7) / height * 100 }; }
export function drawerBounds(viewportWidth: number) { return { min: Math.min(320, viewportWidth - 24), max: Math.max(0, Math.min(viewportWidth * .65, viewportWidth - 24)) }; }
export function readStudioLayout(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): StudioLayout {
  try {
    const value = JSON.parse(storage?.getItem(studioLayoutKey) || 'null');
    return {
      version: 2,
      mainSplitRatio: Number.isFinite(value?.mainSplitRatio) && value.mainSplitRatio >= 10 && value.mainSplitRatio <= 90 ? value.mainSplitRatio : 58,
      focus: value?.version === 2 && ['split','creative','assets'].includes(value.focus) ? value.focus : 'split',
      directorExpanded: value?.version === 2 && value.directorExpanded === true,
      assetDrawerWidth: Number.isFinite(value?.assetDrawerWidth) && value.assetDrawerWidth >= 250 && value.assetDrawerWidth <= 1600 ? value.assetDrawerWidth : 440,
    };
  } catch { return { ...defaultStudioLayout }; }
}
export function saveStudioLayout(layout: StudioLayout, storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { storage?.setItem(studioLayoutKey, JSON.stringify(layout)); } catch { /* Layout preferences must never block production. */ }
}
