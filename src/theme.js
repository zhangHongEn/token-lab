// Keep saved plan color identifiers stable while presenting a softer interface palette.
const colors = {
  "#5869d9": "#cb6045", "#d99b61": "#4d8b73", "#449b87": "#648a91",
  "#9a76c3": "#97809d", "#5c9ebd": "#70859c", "#c77891": "#b17c87",
  "#9b9b4d": "#a18b4e", "#768397": "#7c7a72",
};
export const displayPlanColor = color => colors[color] || color;
