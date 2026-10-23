<script setup>
defineProps({ phase: { type: Number, default: 0 } });
const sparkles = [
  { x: '5%', y: '0%', size: 10, delay: 0, color: '#9e7de0' },
  { x: '92%', y: '12%', size: 12, delay: -1.2, color: '#d6a34d' },
  { x: '74%', y: '96%', size: 9, delay: -2.4, color: '#9e7de0' },
  { x: '32%', y: '90%', size: 7, delay: -3.1, color: '#d6a34d' },
];
</script>

<template>
  <span class="sparkles-text">
    <slot />
    <svg v-for="(sparkle, index) in sparkles" :key="index" class="sparkles-text-star"
      :style="{ left: sparkle.x, top: sparkle.y, width: sparkle.size + 'px', height: sparkle.size + 'px', color: sparkle.color, animationDelay: (sparkle.delay - phase * .55) + 's' }"
      viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M12 0C13.6 8.4 15.6 10.4 24 12C15.6 13.6 13.6 15.6 12 24C10.4 15.6 8.4 13.6 0 12C8.4 10.4 10.4 8.4 12 0Z" />
    </svg>
  </span>
</template>

<style scoped>
.sparkles-text { position: relative; display: inline-block; isolation: isolate; }
.sparkles-text-star { position: absolute; pointer-events: none; opacity: 0; animation: sparkle-twinkle 3.8s ease-in-out infinite; }
@keyframes sparkle-twinkle {
  0%, 55%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0) rotate(0deg); }
  20% { opacity: .85; transform: translate(-50%, -50%) scale(1) rotate(75deg); }
  40% { opacity: 0; transform: translate(-50%, -50%) scale(0) rotate(150deg); }
}
@media (prefers-reduced-motion: reduce) {
  .sparkles-text-star { display: none; animation: none; }
}
</style>
