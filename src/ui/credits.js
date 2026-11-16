export function createCredits(document) {
  const panel = document.getElementById("credits");
  document.getElementById("info").addEventListener("click", () => { panel.hidden = false; });
  document.getElementById("cr-done").addEventListener("click", () => { panel.hidden = true; });
}
