export function createFluidPanel(ctx) {
  const { document } = ctx.env;
  const { FL, ensureAudio, hideHint, say } = ctx;

  const flPanel = document.getElementById('fluidpanel');
  const flBody = document.getElementById('fl-body');
  const flPresetBox = document.getElementById('fl-presets');
  const PRESETS = [
    ['Water', { hue: 205, visc: 0.05, dens: 1.0, opacity: 0.78, glow: 0 }],
    ['Slime', { hue: 110, visc: 0.35, dens: 1.25, opacity: 0.9, glow: 0.1 }],
    ['Lava',  { hue: 18, visc: 0.92, dens: 6.0, opacity: 0.95, glow: 0.9 }],
    ['Ink',   { hue: 275, visc: 0.12, dens: 1.1, opacity: 0.95, glow: 0.15 }]
  ];
  const FL_FIELDS = [
    ['amount', 'Amount', 0, 1, 0.01], ['visc', 'Thickness', 0, 0.98, 0.01], ['dens', 'Density', 0.3, 10, 0.05],
    ['hue', 'Color', 0, 360, 1], ['opacity', 'Murk', 0.3, 1, 0.01], ['glow', 'Glow', 0, 1, 0.01]
  ];
  const flRefs = {};
  function showFl(key) {
    const v = FL[key];
    flRefs[key].inp.value = v;
    flRefs[key].out.textContent = key === 'hue' ? String(Math.round(v)) : Number(v).toFixed(2);
  }
  FL_FIELDS.forEach(fd => {
    const key = fd[0];
    const row = document.createElement('label'); row.className = 'sl';
    row.innerHTML = '<span></span><input type="range"><output></output>';
    row.children[0].textContent = fd[1];
    const inp = row.children[1];
    inp.min = fd[2]; inp.max = fd[3]; inp.step = fd[4];
    inp.addEventListener('input', () => {
      FL[key] = parseFloat(inp.value);
      showFl(key); ctx.applyFluidLook();
      if (key !== 'amount') flPresetBox.querySelectorAll('button').forEach(b => b.classList.remove('on'));
    });
    flBody.appendChild(row);
    flRefs[key] = { inp, out: row.children[2] };
  });
  PRESETS.forEach(p => {
    const b = document.createElement('button');
    b.textContent = p[0];
    b.addEventListener('click', () => {
      Object.assign(FL, p[1]);
      FL_FIELDS.forEach(fd => showFl(fd[0]));
      ctx.applyFluidLook();
      flPresetBox.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
    flPresetBox.appendChild(b);
  });
  flPresetBox.firstChild.classList.add('on');
  FL_FIELDS.forEach(fd => showFl(fd[0]));

  function refreshSheet() { document.body.classList.toggle('editing', !!ctx.sel || ctx.fluidOpen); }
  function openFluidPanel() {
    ctx.closeEditor();
    ctx.fluidOpen = true; flPanel.hidden = false; hideHint();
    refreshSheet();
  }
  function closeFluidPanel() {
    if (!ctx.fluidOpen) return;
    ctx.fluidOpen = false; flPanel.hidden = true;
    refreshSheet();
  }
  function setAmount(a) {
    FL.amount = a; showFl('amount');
    if (a > 0 && !ctx.stirHinted) { ctx.stirHinted = true; say('Drag a finger through the liquid to stir it', 2600); }
  }
  document.getElementById('fluid').addEventListener('click', () => { ensureAudio(); openFluidPanel(); });
  document.getElementById('fl-done').addEventListener('click', closeFluidPanel);
  document.getElementById('fl-fill').addEventListener('click', () => { ensureAudio(); setAmount(0.75); });
  document.getElementById('fl-drain').addEventListener('click', () => { setAmount(0); });

  const api = { showFl, refreshSheet, openFluidPanel, closeFluidPanel, setAmount };
  Object.assign(ctx, api);
  return api;
}
