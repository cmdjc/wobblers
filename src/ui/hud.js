export function createHud(ctx) {
  const { document, setTimeout, clearTimeout } = ctx.env;
  const sayEl = document.getElementById('say');

  function say(text, ms) {
    sayEl.textContent = text; sayEl.classList.add('on');
    clearTimeout(ctx.sayTimer);
    ctx.sayTimer = setTimeout(() => sayEl.classList.remove('on'), ms || 1400);
  }
  function hideHint() {
    if (ctx.hintDone) return;
    ctx.hintDone = true; clearTimeout(ctx.sayTimer); sayEl.classList.remove('on');
  }

  const api = { say, hideHint };
  Object.assign(ctx, api);
  return api;
}
