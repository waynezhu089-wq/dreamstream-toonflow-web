import { inject, provide, ref, type InjectionKey } from 'vue';
export type StudioReviewImage = { id: string; src: string; label: string; candidateId?: string };
export function createStudioImageReview() {
  const group = ref<StudioReviewImage[]>([]), index = ref(0), groupKey = ref('');
  function close() { group.value = []; index.value = 0; groupKey.value = ''; }
  function open(key: string, images: StudioReviewImage[], selected = 0) {
    const valid = images.filter(image => !!image.src);
    if (!valid.length) return;
    groupKey.value = key; group.value = valid;
    index.value = Math.max(0, Math.min(selected, valid.length - 1));
  }
  return { group, index, groupKey, open, close };
}
const key: InjectionKey<ReturnType<typeof createStudioImageReview>> = Symbol('Studio image review');
export function provideStudioImageReview() { const review = createStudioImageReview(); provide(key, review); return review; }
export function useStudioImageReview() { return inject(key, null); }
