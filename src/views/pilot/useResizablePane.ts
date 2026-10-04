import { onBeforeUnmount, type Ref } from 'vue';
import { clamp } from './studioLayout';

type Options = {
  value: Ref<number>;
  defaultValue: number;
  axis: 'x' | 'y';
  reverse?: boolean;
  step?: number;
  bounds: () => { min: number; max: number };
  measure: (event: PointerEvent) => number;
};

export function useResizablePane(options: Options) {
  let dragging = false;
  let handle: HTMLElement | null = null;
  let pointerId = -1;
  let oldUserSelect = '';
  function set(value: number) {
    const { min, max } = options.bounds();
    options.value.value = clamp(value, Math.min(min, max), Math.max(min, max));
  }
  function cleanup(event?: Event) {
    if (!dragging) return;
    dragging = false;
    document.body.style.userSelect = oldUserSelect;
    // The browser releases capture automatically after pointerup. Releasing it
    // early retargets the following click and prevents a native double-click.
    if (event?.type !== 'pointerup' && handle?.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    handle = null; pointerId = -1;
    window.removeEventListener('pointerup', cleanup);
    window.removeEventListener('pointercancel', cleanup);
    window.removeEventListener('pointermove', pointermove);
    window.removeEventListener('blur', cleanup);
  }
  function pointerdown(event: PointerEvent) {
    if (event.button !== 0) return;
    // Mouse click/double-click must remain available for the reset gesture.
    // Text selection is disabled below while a drag is active.
    if (event.pointerType !== 'mouse') event.preventDefault();
    event.stopPropagation();
    cleanup(); dragging = true; pointerId = event.pointerId;
    handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(pointerId);
    oldUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
    window.addEventListener('pointermove', pointermove);
    window.addEventListener('blur', cleanup);
  }
  function pointermove(event: PointerEvent) {
    if (dragging && event.pointerId === pointerId) { event.preventDefault(); set(options.measure(event)); }
  }
  function keydown(event: KeyboardEvent) {
    const minus = options.axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const plus = options.axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== minus && event.key !== plus) return;
    event.preventDefault(); event.stopPropagation();
    set(options.value.value + (event.key === plus ? 1 : -1) * (options.reverse ? -1 : 1) * (options.step ?? 2));
  }
  function reset() { set(options.defaultValue); }
  onBeforeUnmount(cleanup);
  return { pointerdown, pointermove, pointerup: cleanup, pointercancel: cleanup, keydown, reset, cancel: cleanup, clamp: () => set(options.value.value) };
}
