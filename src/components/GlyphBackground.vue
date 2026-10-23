<script setup>
import { onMounted, onBeforeUnmount, ref } from "vue";
const canvas = ref(null);
let context, width = 0, height = 0, frame = 0;
let pointer = null, reducedMotion, finePointer;
const characters = "01{}[]<>/+=*abcdef";

function draw() {
  frame = 0;
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (let row = 0; row < height / 30; row++) {
    for (let col = 0; col < width / 28; col++) {
      const seed = ((col + 1) * 73856093 ^ (row + 1) * 19349663) >>> 0;
      if (seed % 5 < 2) continue;
      const x = col * 28 + 14, y = row * 30 + 15;
      // Static glyphs fade from transparent at the viewport center to 4% at its edges.
      const edge = Math.min(1, Math.hypot((x - width / 2) / (width / 2), (y - height / 2) / (height / 2)));
      const backgroundAlpha = edge * edge * (3 - 2 * edge) * 0.04;
      const distance = pointer ? Math.hypot(x - pointer.x, y - pointer.y) : Infinity;
      // Smooth falloff reaches zero at the rim: no visible circle or hard mask.
      const t = Math.max(0, 1 - distance / 190);
      const focus = t * t * (3 - 2 * t);
      const scale = 1 + focus * 0.36;
      const px = pointer ? x + (x - pointer.x) * focus * 0.05 : x;
      const py = pointer ? y + (y - pointer.y) * focus * 0.05 : y;
      context.font = `${10 * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      context.fillStyle = `rgba(88, 98, 118, ${backgroundAlpha + focus * 0.22})`;
      context.fillText(characters[seed % characters.length], px, py);
    }
  }
}
function schedule() { if (!frame) frame = requestAnimationFrame(draw); }
function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.value.width = Math.round(width * ratio);
  canvas.value.height = Math.round(height * ratio);
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  schedule();
}
function move(event) {
  if (reducedMotion.matches || !finePointer.matches || event.pointerType === "touch") return;
  pointer = { x: event.clientX, y: event.clientY };
  schedule();
}
function leave() { pointer = null; schedule(); }
onMounted(() => {
  context = canvas.value.getContext("2d");
  if (!context) return;
  reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("pointermove", move, { passive: true });
  document.documentElement.addEventListener("pointerleave", leave);
  window.addEventListener("blur", leave);
  reducedMotion.addEventListener("change", leave);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  window.removeEventListener("resize", resize);
  window.removeEventListener("pointermove", move);
  document.documentElement.removeEventListener("pointerleave", leave);
  window.removeEventListener("blur", leave);
  reducedMotion?.removeEventListener("change", leave);
});
</script>

<template><canvas ref="canvas" class="glyph-background" aria-hidden="true"></canvas></template>
