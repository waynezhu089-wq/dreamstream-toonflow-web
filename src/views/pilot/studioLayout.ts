export const studioLayoutKey = 'dreamstream:v04:studio-layout';
export type StudioLayout = { mainSplitRatio: number; leftVerticalSplitRatio: number; assetDrawerWidth: number };
export const defaultStudioLayout: StudioLayout = { mainSplitRatio: 58, leftVerticalSplitRatio: 62, assetDrawerWidth: 440 };
export function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), max); }
export function mainBounds(width: number) { return { min: 420 / width * 100, max: (width - 340 - 7) / width * 100 }; }
// The Agent header, feed and composer need more than the theoretical 220px
// minimum to remain usable on an ordinary laptop screen.
export function verticalBounds(height: number) { return { min: 220 / height * 100, max: (height - 400 - 7) / height * 100 }; }
export function drawerBounds(viewportWidth: number) { return { min: Math.min(320, viewportWidth - 24), max: Math.max(0, Math.min(viewportWidth * .65, viewportWidth - 24)) }; }
export function readStudioLayout(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): StudioLayout {
  try {
    const value = JSON.parse(storage?.getItem(studioLayoutKey) || 'null');
    return {
      mainSplitRatio: Number.isFinite(value?.mainSplitRatio) && value.mainSplitRatio >= 20 && value.mainSplitRatio <= 80 ? value.mainSplitRatio : 58,
      leftVerticalSplitRatio: Number.isFinite(value?.leftVerticalSplitRatio) && value.leftVerticalSplitRatio >= 20 && value.leftVerticalSplitRatio <= 80 ? value.leftVerticalSplitRatio : 62,
      assetDrawerWidth: Number.isFinite(value?.assetDrawerWidth) && value.assetDrawerWidth >= 250 && value.assetDrawerWidth <= 1600 ? value.assetDrawerWidth : 440,
    };
  } catch { return { ...defaultStudioLayout }; }
}
export function saveStudioLayout(layout: StudioLayout, storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage) {
  try { storage?.setItem(studioLayoutKey, JSON.stringify(layout)); } catch { /* Layout preferences must never block production. */ }
}
