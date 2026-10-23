<script setup>
import { getValue, setValue } from "../config.js";
import FieldHint from "./FieldHint.vue";
const props = defineProps({ object: Object, field: Array, error: String });
const emit = defineEmits(["change"]);
function update(event) {
  const value = event.target.value === "" ? "" : Number(event.target.value);
  setValue(props.object, props.field[0], value === "" ? "" : props.field[2] === "%" ? value / 100 : value);
  emit("change");
}
function displayValue() {
  const value = getValue(props.object, props.field[0]);
  return value === "" ? "" : props.field[2] === "%" ? Number((value * 100).toFixed(8)) : value;
}
</script>

<template>
  <label class="field">
    <span>{{ field[1] }}<FieldHint v-if="field[5]" :text="field[5]" /></span>
    <span class="input-wrap" :class="{ invalid: error }">
      <input :aria-label="field[1]" :aria-description="field[5]" :aria-invalid="!!error" :aria-describedby="error ? 'error-' + field[0] : undefined" type="number" :min="field[3] ?? 0" :max="field[4]" step="any" :value="displayValue()" @input="update" />
      <span class="input-unit">{{ field[2] }}</span>
    </span>
    <small v-if="error" :id="'error-' + field[0]" class="error">{{ error }}</small>
  </label>
</template>
