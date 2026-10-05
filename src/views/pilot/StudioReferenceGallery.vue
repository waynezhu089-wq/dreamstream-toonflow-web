<template>
  <section v-if="images.length" class="reference-gallery" aria-label="其他参考"><h3>其他参考</h3><div class="reference-grid"><figure v-for="(image,index) in images" :key="image.id"><button type="button" :aria-label="`查看${image.label}`" @click="$emit('open',index)"><img :src="image.src" :alt="image.label" loading="lazy" /></button><figcaption>{{ image.label }}</figcaption></figure></div></section>
</template>
<script setup lang="ts">
import type {StudioReviewImage} from './studioImageReview';
defineProps<{images:StudioReviewImage[]}>();defineEmits<{(e:'open',index:number):void}>();
</script>
<style scoped>
.reference-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(100px,1fr));gap:.7rem}.reference-grid figure{margin:0}.reference-grid button{display:grid;place-items:center;width:100%;height:135px;padding:0;background:var(--td-bg-color-secondarycontainer);border:0;border-radius:6px;cursor:zoom-in}.reference-grid img{display:block;max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}.reference-grid button:hover{outline:1px solid var(--td-brand-color)}figcaption{font-size:.78rem;margin-top:.35rem;color:var(--td-text-color-secondary)}
</style>
