import { onBeforeUnmount, onMounted, ref } from "vue";

export function useHeaderOpacity() {
  const opacity = ref(0);
  const update = () => { opacity.value = Math.min(0.8, Math.max(0, window.scrollY) / 100); };

  onMounted(() => {
    update();
    window.addEventListener("scroll", update, { passive: true });
  });
  onBeforeUnmount(() => window.removeEventListener("scroll", update));

  return opacity;
}
