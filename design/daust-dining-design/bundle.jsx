
/* ===== tweaks-panel.jsx ===== */

/* BEGIN USAGE */
// tweaks-panel.jsx
// Reusable Tweaks shell + form-control helpers.
// Exports (to window): useTweaks, TweaksPanel, TweakSection, TweakRow, TweakSlider,
//   TweakToggle, TweakRadio, TweakSelect, TweakText, TweakNumber, TweakColor, TweakButton.
//
// Owns the host protocol (listens for __activate_edit_mode / __deactivate_edit_mode,
// posts __edit_mode_available / __edit_mode_set_keys / __edit_mode_dismissed) so
// individual prototypes don't re-roll it. Ships a consistent set of controls so you
// don't hand-draw <input type="range">, segmented radios, steppers, etc.
//
// Usage (in an HTML file that loads React + Babel):
//
//   const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
//     "primaryColor": "#D97757",
//     "palette": ["#D97757", "#29261b", "#f6f4ef"],
//     "fontSize": 16,
//     "density": "regular",
//     "dark": false
//   }/*EDITMODE-END*/;
//
//   function App() {
//     const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
//     return (
//       <div style={{ fontSize: t.fontSize, color: t.primaryColor }}>
//         Hello
//         <TweaksPanel>
//           <TweakSection label="Typography" />
//           <TweakSlider label="Font size" value={t.fontSize} min={10} max={32} unit="px"
//                        onChange={(v) => setTweak('fontSize', v)} />
//           <TweakRadio  label="Density" value={t.density}
//                        options={['compact', 'regular', 'comfy']}
//                        onChange={(v) => setTweak('density', v)} />
//           <TweakSection label="Theme" />
//           <TweakColor  label="Primary" value={t.primaryColor}
//                        options={['#D97757', '#2A6FDB', '#1F8A5B', '#7A5AE0']}
//                        onChange={(v) => setTweak('primaryColor', v)} />
//           <TweakColor  label="Palette" value={t.palette}
//                        options={[['#D97757', '#29261b', '#f6f4ef'],
//                                  ['#475569', '#0f172a', '#f1f5f9']]}
//                        onChange={(v) => setTweak('palette', v)} />
//           <TweakToggle label="Dark mode" value={t.dark}
//                        onChange={(v) => setTweak('dark', v)} />
//         </TweaksPanel>
//       </div>
//     );
//   }
//
// TweakRadio is the segmented control for 2–3 short options (auto-falls-back to
// TweakSelect past ~16/~10 chars per label); reach for TweakSelect directly when
// options are many or long. For color tweaks always curate 3-4 options rather than
// a free picker; an option can also be a whole 2–5 color palette (the stored value
// is the array). The Tweak* controls are a floor, not a ceiling — build custom
// controls inside the panel if a tweak calls for UI they don't cover.
/* END USAGE */
// ─────────────────────────────────────────────────────────────────────────────

const __TWEAKS_STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:2147483646;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    transform:scale(var(--dc-inv-zoom,1));transform-origin:bottom right;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600;letter-spacing:.01em}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0;
    scrollbar-width:thin;scrollbar-color:rgba(0,0,0,.15) transparent}
  .twk-body::-webkit-scrollbar{width:8px}
  .twk-body::-webkit-scrollbar-track{background:transparent;margin:2px}
  .twk-body::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:4px;
    border:2px solid transparent;background-clip:content-box}
  .twk-body::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25);
    border:2px solid transparent;background-clip:content-box}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;
    color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5);font-variant-numeric:tabular-nums}

  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}

  .twk-field{appearance:none;box-sizing:border-box;width:100%;min-width:0;height:26px;padding:0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;
    background:rgba(255,255,255,.6);color:inherit;font:inherit;outline:none}
  .twk-field:focus{border-color:rgba(0,0,0,.25);background:rgba(255,255,255,.85)}
  select.twk-field{padding-right:22px;
    background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path fill='rgba(0,0,0,.5)' d='M0 0h10L5 6z'/></svg>");
    background-repeat:no-repeat;background-position:right 8px center}

  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;
    width:14px;height:14px;border-radius:50%;background:#fff;
    border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-slider::-moz-range-thumb{width:14px;height:14px;border-radius:50%;
    background:#fff;border:.5px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}

  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s cubic-bezier(.3,.7,.4,1),width .15s}
  .twk-seg.dragging .twk-seg-thumb{transition:none}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px;line-height:1.2;
    overflow-wrap:anywhere}

  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}

  .twk-num{display:flex;align-items:center;box-sizing:border-box;min-width:0;height:26px;padding:0 0 0 8px;
    border:.5px solid rgba(0,0,0,.1);border-radius:7px;background:rgba(255,255,255,.6)}
  .twk-num-lbl{font-weight:500;color:rgba(41,38,27,.6);cursor:ew-resize;
    user-select:none;padding-right:8px}
  .twk-num input{flex:1;min-width:0;height:100%;border:0;background:transparent;
    font:inherit;font-variant-numeric:tabular-nums;text-align:right;padding:0 8px 0 0;
    outline:none;color:inherit;-moz-appearance:textfield}
  .twk-num input::-webkit-inner-spin-button,.twk-num input::-webkit-outer-spin-button{
    -webkit-appearance:none;margin:0}
  .twk-num-unit{padding-right:8px;color:rgba(41,38,27,.45)}

  .twk-btn{appearance:none;height:26px;padding:0 12px;border:0;border-radius:7px;
    background:rgba(0,0,0,.78);color:#fff;font:inherit;font-weight:500;cursor:default}
  .twk-btn:hover{background:rgba(0,0,0,.88)}
  .twk-btn.secondary{background:rgba(0,0,0,.06);color:inherit}
  .twk-btn.secondary:hover{background:rgba(0,0,0,.1)}

  .twk-swatch{appearance:none;-webkit-appearance:none;width:56px;height:22px;
    border:.5px solid rgba(0,0,0,.1);border-radius:6px;padding:0;cursor:default;
    background:transparent;flex-shrink:0}
  .twk-swatch::-webkit-color-swatch-wrapper{padding:0}
  .twk-swatch::-webkit-color-swatch{border:0;border-radius:5.5px}
  .twk-swatch::-moz-color-swatch{border:0;border-radius:5.5px}

  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;min-width:0;height:46px;
    padding:0;border:0;border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 1px 2px rgba(0,0,0,.06);
    transition:transform .12s cubic-bezier(.3,.7,.4,1),box-shadow .12s}
  .twk-chip:hover{transform:translateY(-1px);
    box-shadow:0 0 0 .5px rgba(0,0,0,.18),0 4px 10px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85),
    0 2px 6px rgba(0,0,0,.15)}
  .twk-chip>span{position:absolute;top:0;bottom:0;right:0;width:34%;
    display:flex;flex-direction:column;box-shadow:-1px 0 0 rgba(0,0,0,.1)}
  .twk-chip>span>i{flex:1;box-shadow:0 -1px 0 rgba(0,0,0,.1)}
  .twk-chip>span>i:first-child{box-shadow:none}
  .twk-chip svg{position:absolute;top:6px;left:6px;width:13px;height:13px;
    filter:drop-shadow(0 1px 1px rgba(0,0,0,.3))}
`;

// ── useTweaks ───────────────────────────────────────────────────────────────
// Single source of truth for tweak values. setTweak persists via the host
// (__edit_mode_set_keys → host rewrites the EDITMODE block on disk).
function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  // Accepts either setTweak('key', value) or setTweak({ key: value, ... }) so a
  // useState-style call doesn't write a "[object Object]" key into the persisted
  // JSON block.
  const setTweak = React.useCallback((keyOrEdits, val) => {
    const edits = typeof keyOrEdits === 'object' && keyOrEdits !== null
      ? keyOrEdits : { [keyOrEdits]: val };
    setValues((prev) => ({ ...prev, ...edits }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
    // Same-window signal so in-page listeners (deck-stage rail thumbnails)
    // can react — the parent message only reaches the host, not peers.
    window.dispatchEvent(new CustomEvent('tweakchange', { detail: edits }));
  }, []);
  return [values, setTweak];
}

// ── TweaksPanel ─────────────────────────────────────────────────────────────
// Floating shell. Registers the protocol listener BEFORE announcing
// availability — if the announce ran first, the host's activate could land
// before our handler exists and the toolbar toggle would silently no-op.
// The close button posts __edit_mode_dismissed so the host's toolbar toggle
// flips off in lockstep; the host echoes __deactivate_edit_mode back which
// is what actually hides the panel.
function TweaksPanel({ title = 'Tweaks', children }) {
  const [open, setOpen] = React.useState(false);
  const dragRef = React.useRef(null);
  const offsetRef = React.useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clampToViewport = React.useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    const maxRight = Math.max(PAD, window.innerWidth - w - PAD);
    const maxBottom = Math.max(PAD, window.innerHeight - h - PAD);
    offsetRef.current = {
      x: Math.min(maxRight, Math.max(PAD, offsetRef.current.x)),
      y: Math.min(maxBottom, Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + 'px';
    panel.style.bottom = offsetRef.current.y + 'px';
  }, []);

  React.useEffect(() => {
    if (!open) return;
    clampToViewport();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', clampToViewport);
      return () => window.removeEventListener('resize', clampToViewport);
    }
    const ro = new ResizeObserver(clampToViewport);
    ro.observe(document.documentElement);
    return () => ro.disconnect();
  }, [open, clampToViewport]);

  React.useEffect(() => {
    const onMsg = (e) => {
      const t = e?.data?.type;
      if (t === '__activate_edit_mode') setOpen(true);
      else if (t === '__deactivate_edit_mode') setOpen(false);
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const dismiss = () => {
    setOpen(false);
    window.parent.postMessage({ type: '__edit_mode_dismissed' }, '*');
  };

  const onDragStart = (e) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev) => {
      offsetRef.current = {
        x: startRight - (ev.clientX - sx),
        y: startBottom - (ev.clientY - sy),
      };
      clampToViewport();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  if (!open) return null;
  return (
    <>
      <style>{__TWEAKS_STYLE}</style>
      <div ref={dragRef} className="twk-panel" data-omelette-chrome=""
           style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" aria-label="Close tweaks"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={dismiss}>✕</button>
        </div>
        <div className="twk-body">
          {children}
        </div>
      </div>
    </>
  );
}

// ── Layout helpers ──────────────────────────────────────────────────────────

function TweakSection({ label, children }) {
  return (
    <>
      <div className="twk-sect">{label}</div>
      {children}
    </>
  );
}

function TweakRow({ label, value, children, inline = false }) {
  return (
    <div className={inline ? 'twk-row twk-row-h' : 'twk-row'}>
      <div className="twk-lbl">
        <span>{label}</span>
        {value != null && <span className="twk-val">{value}</span>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ────────────────────────────────────────────────────────────────

function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = '', onChange }) {
  return (
    <TweakRow label={label} value={`${value}${unit}`}>
      <input type="range" className="twk-slider" min={min} max={max} step={step}
             value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </TweakRow>
  );
}

function TweakToggle({ label, value, onChange }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? '1' : '0'}
              role="switch" aria-checked={!!value}
              onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

function TweakRadio({ label, value, options, onChange }) {
  const trackRef = React.useRef(null);
  const [dragging, setDragging] = React.useState(false);
  // The active value is read by pointer-move handlers attached for the lifetime
  // of a drag — ref it so a stale closure doesn't fire onChange for every move.
  const valueRef = React.useRef(value);
  valueRef.current = value;

  // Segments wrap mid-word once per-segment width runs out. The track is
  // ~248px (280 panel − 28 body pad − 4 seg pad), each button loses 12px
  // to its own padding, and 11.5px system-ui averages ~6.3px/char — so 2
  // options fit ~16 chars each, 3 fit ~10. Past that (or >3 options), fall
  // back to a dropdown rather than wrap.
  const labelLen = (o) => String(typeof o === 'object' ? o.label : o).length;
  const maxLen = options.reduce((m, o) => Math.max(m, labelLen(o)), 0);
  const fitsAsSegments = maxLen <= ({ 2: 16, 3: 10 }[options.length] ?? 0);
  if (!fitsAsSegments) {
    // <select> emits strings — map back to the original option value so the
    // fallback stays type-preserving (numbers, booleans) like the segment path.
    const resolve = (s) => {
      const m = options.find((o) => String(typeof o === 'object' ? o.value : o) === s);
      return m === undefined ? s : typeof m === 'object' ? m.value : m;
    };
    return <TweakSelect label={label} value={value} options={options}
                        onChange={(s) => onChange(resolve(s))} />;
  }
  const opts = options.map((o) => (typeof o === 'object' ? o : { value: o, label: o }));
  const idx = Math.max(0, opts.findIndex((o) => o.value === value));
  const n = opts.length;

  const segAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    const inner = r.width - 4;
    const i = Math.floor(((clientX - r.left - 2) / inner) * n);
    return opts[Math.max(0, Math.min(n - 1, i))].value;
  };

  const onPointerDown = (e) => {
    setDragging(true);
    const v0 = segAt(e.clientX);
    if (v0 !== valueRef.current) onChange(v0);
    const move = (ev) => {
      if (!trackRef.current) return;
      const v = segAt(ev.clientX);
      if (v !== valueRef.current) onChange(v);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <TweakRow label={label}>
      <div ref={trackRef} role="radiogroup" onPointerDown={onPointerDown}
           className={dragging ? 'twk-seg dragging' : 'twk-seg'}>
        <div className="twk-seg-thumb"
             style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`,
                      width: `calc((100% - 4px) / ${n})` }} />
        {opts.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value}>
            {o.label}
          </button>
        ))}
      </div>
    </TweakRow>
  );
}

function TweakSelect({ label, value, options, onChange }) {
  return (
    <TweakRow label={label}>
      <select className="twk-field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => {
          const v = typeof o === 'object' ? o.value : o;
          const l = typeof o === 'object' ? o.label : o;
          return <option key={v} value={v}>{l}</option>;
        })}
      </select>
    </TweakRow>
  );
}

function TweakText({ label, value, placeholder, onChange }) {
  return (
    <TweakRow label={label}>
      <input className="twk-field" type="text" value={value} placeholder={placeholder}
             onChange={(e) => onChange(e.target.value)} />
    </TweakRow>
  );
}

function TweakNumber({ label, value, min, max, step = 1, unit = '', onChange }) {
  const clamp = (n) => {
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  };
  const startRef = React.useRef({ x: 0, val: 0 });
  const onScrubStart = (e) => {
    e.preventDefault();
    startRef.current = { x: e.clientX, val: value };
    const decimals = (String(step).split('.')[1] || '').length;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const raw = startRef.current.val + dx * step;
      const snapped = Math.round(raw / step) * step;
      onChange(clamp(Number(snapped.toFixed(decimals))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div className="twk-num">
      <span className="twk-num-lbl" onPointerDown={onScrubStart}>{label}</span>
      <input type="number" value={value} min={min} max={max} step={step}
             onChange={(e) => onChange(clamp(Number(e.target.value)))} />
      {unit && <span className="twk-num-unit">{unit}</span>}
    </div>
  );
}

// Relative-luminance contrast pick — checkmarks drawn over a swatch need to
// read on both #111 and #fafafa without per-option configuration. Hex input
// only (#rgb / #rrggbb); named or rgb()/hsl() colors fall through to "light".
function __twkIsLight(hex) {
  const h = String(hex).replace('#', '');
  const x = h.length === 3 ? h.replace(/./g, (c) => c + c) : h.padEnd(6, '0');
  const n = parseInt(x.slice(0, 6), 16);
  if (Number.isNaN(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return r * 299 + g * 587 + b * 114 > 148000;
}

const __TwkCheck = ({ light }) => (
  <svg viewBox="0 0 14 14" aria-hidden="true">
    <path d="M3 7.2 5.8 10 11 4.2" fill="none" strokeWidth="2.2"
          strokeLinecap="round" strokeLinejoin="round"
          stroke={light ? 'rgba(0,0,0,.78)' : '#fff'} />
  </svg>
);

// TweakColor — curated color/palette picker. Each option is either a single
// hex string or an array of 1-5 hex strings; the card adapts — a lone color
// renders solid, a palette renders colors[0] as the hero (left ~2/3) with the
// rest stacked in a sharp column on the right. onChange emits the
// option in the shape it was passed (string stays string, array stays array).
// Without options it falls back to the native color input for back-compat.
function TweakColor({ label, value, options, onChange }) {
  if (!options || !options.length) {
    return (
      <div className="twk-row twk-row-h">
        <div className="twk-lbl"><span>{label}</span></div>
        <input type="color" className="twk-swatch" value={value}
               onChange={(e) => onChange(e.target.value)} />
      </div>
    );
  }
  // Native <input type=color> emits lowercase hex per the HTML spec, so
  // compare case-insensitively. String() guards JSON.stringify(undefined),
  // which returns the primitive undefined (no .toLowerCase).
  const key = (o) => String(JSON.stringify(o)).toLowerCase();
  const cur = key(value);
  return (
    <TweakRow label={label}>
      <div className="twk-chips" role="radiogroup">
        {options.map((o, i) => {
          const colors = Array.isArray(o) ? o : [o];
          const [hero, ...rest] = colors;
          const sup = rest.slice(0, 4);
          const on = key(o) === cur;
          return (
            <button key={i} type="button" className="twk-chip" role="radio"
                    aria-checked={on} data-on={on ? '1' : '0'}
                    aria-label={colors.join(', ')} title={colors.join(' · ')}
                    style={{ background: hero }}
                    onClick={() => onChange(o)}>
              {sup.length > 0 && (
                <span>
                  {sup.map((c, j) => <i key={j} style={{ background: c }} />)}
                </span>
              )}
              {on && <__TwkCheck light={__twkIsLight(hero)} />}
            </button>
          );
        })}
      </div>
    </TweakRow>
  );
}

function TweakButton({ label, onClick, secondary = false }) {
  return (
    <button type="button" className={secondary ? 'twk-btn secondary' : 'twk-btn'}
            onClick={onClick}>{label}</button>
  );
}

Object.assign(window, {
  useTweaks, TweaksPanel, TweakSection, TweakRow,
  TweakSlider, TweakToggle, TweakRadio, TweakSelect,
  TweakText, TweakNumber, TweakColor, TweakButton,
});


/* ===== shared.jsx ===== */
/* ============================================================
   DAUST Dining — shared primitives, helpers & mock data
   Exposes everything on window for cross-file Babel scope.
   ============================================================ */

const D = {
  navy: '#153b6a', navyDeep: '#0f2c50', navy700: '#1d4a82',
  orange: '#ed8425', orange600: '#d6731a', steel: '#9da6ae',
  white: '#ffffff', subtle: '#f5f7f9',
  border: '#d7dee6', borderStrong: '#bcc6d1',
  fg1: '#141a21', fg2: '#4d5965', fg3: '#6c7884',
  onNavyMuted: '#b9c4d4',
  g50:'#f5f7f9', g100:'#e9edf2', g200:'#d7dee6', g300:'#bcc6d1', g400:'#9da6ae', g500:'#6c7884',
  success: '#2e7d52', successBg:'#eaf3ee', danger: '#c0392b', dangerBg:'#fbecea', warning:'#ed8425',
  display: "'Saira', system-ui, sans-serif",
  body: "'Montserrat', system-ui, sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

/* ---------- helpers ---------- */
function hashStr(s) { let h = 2166136261; for (let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h>>>0); }
function mulberry(seed){ return function(){ let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t>>>15, t|1); t ^= t + Math.imul(t ^ t>>>7, t|61); return ((t ^ t>>>14)>>>0)/4294967296; }; }
function fcfa(n){ return n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g,' ') + ' FCFA'; }
function fcfaShort(n){ const a=Math.abs(n); const s=n<0?'-':''; if(a>=1e6) return s+(a/1e6).toFixed(a>=1e7?0:1).replace('.0','')+'M'; if(a>=1e3) return s+Math.round(a/1e3)+'k'; return s+a; }
function initials(name){ const p = name.trim().split(/\s+/); return ((p[0]?.[0]||'') + (p[1]?.[0]||'')).toUpperCase(); }
function cx(...a){ return a.filter(Boolean).join(' '); }

const AVATAR_BG = ['#1d4a82','#153b6a','#36414d','#4d5965','#0f2c50','#2e5a8f'];

/* ---------- icon (lucide) — batched render to avoid per-icon full-doc scans ---------- */
let _lucidePending = false;
function scheduleLucide(){
  if (_lucidePending) return;
  _lucidePending = true;
  setTimeout(()=>{ _lucidePending = false; if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); }, 0);
}
function Icon({ name, size = 18, color, strokeWidth = 2, style }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const host = ref.current; if (!host) return;
    host.innerHTML = '';
    const el = document.createElement('i');
    el.setAttribute('data-lucide', name);
    el.setAttribute('width', size); el.setAttribute('height', size);
    el.setAttribute('stroke-width', strokeWidth);
    host.appendChild(el);
    scheduleLucide();
  }, [name, size, strokeWidth]);
  return <span ref={ref} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:size, height:size, color: color||'currentColor', flexShrink:0, ...style }} />;
}

/* ---------- TriDash ---------- */
function TriDash({ w = 28, h = 4, gap = 6, style }) {
  const bar = (c) => <span style={{ display:'block', width:w, height:h, borderRadius:999, background:c }} />;
  return <div style={{ display:'flex', gap, alignItems:'center', ...style }}>{bar(D.navy)}{bar(D.orange)}{bar(D.steel)}</div>;
}

/* ---------- Avatar ---------- */
function Avatar({ name, size = 44, ring }) {
  const bg = AVATAR_BG[hashStr(name) % AVATAR_BG.length];
  return (
    <div style={{ width:size, height:size, borderRadius:'50%', background:bg, color:'#fff', display:'grid', placeItems:'center',
      fontFamily:D.display, fontWeight:700, fontSize:size*0.38, letterSpacing:'.02em', flexShrink:0,
      boxShadow: ring ? `0 0 0 3px ${ring}` : 'none' }}>{initials(name)}</div>
  );
}

/* ---------- QR code (decorative, deterministic) ---------- */
function QRCode({ value = 'DAUST', size = 180, fg = '#0f2c50', bg = '#ffffff', quiet = true, logo = true }) {
  const N = 29;
  const cells = React.useMemo(() => {
    const rnd = mulberry(hashStr(value) || 1);
    const g = Array.from({length:N}, () => Array.from({length:N}, () => rnd() > 0.5));
    const isFinder = (r,c) => (r<8&&c<8)||(r<8&&c>=N-8)||(r>=N-8&&c<8);
    for (let r=0;r<N;r++) for (let c=0;c<N;c++) if (isFinder(r,c)) g[r][c]=false;
    // clear center for logo
    if (logo) for (let r=11;r<18;r++) for (let c=11;c<18;c++) g[r][c]=false;
    return g;
  }, [value]);
  const pad = quiet ? 2 : 0;
  const total = N + pad*2;
  const unit = size/total;
  const finder = (r,c) => (
    <g key={`f${r}${c}`}>
      <rect x={(c+pad)*unit} y={(r+pad)*unit} width={unit*7} height={unit*7} rx={unit*1.6} fill={fg} />
      <rect x={(c+pad+1)*unit} y={(r+pad+1)*unit} width={unit*5} height={unit*5} rx={unit*1.1} fill={bg} />
      <rect x={(c+pad+2)*unit} y={(r+pad+2)*unit} width={unit*3} height={unit*3} rx={unit*0.7} fill={fg} />
    </g>
  );
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display:'block', borderRadius: size*0.06 }}>
      <rect width={size} height={size} fill={bg} />
      {cells.map((row,r)=>row.map((on,c)=> on ? <rect key={`${r}-${c}`} x={(c+pad)*unit+unit*0.08} y={(r+pad)*unit+unit*0.08} width={unit*0.84} height={unit*0.84} rx={unit*0.22} fill={fg} /> : null))}
      {finder(0,0)}{finder(0,N-7)}{finder(N-7,0)}
      {logo && <g>
        <rect x={size*0.5-unit*3.4} y={size*0.5-unit*3.4} width={unit*6.8} height={unit*6.8} rx={unit*1.6} fill={bg} />
        <rect x={size*0.5-unit*2.7} y={size*0.5-unit*2.7} width={unit*5.4} height={unit*5.4} rx={unit*1.2} fill={D.navy} />
        <text x={size*0.5} y={size*0.5} dy={unit*1.1} textAnchor="middle" fontFamily={D.display} fontWeight="800" fontSize={unit*2.6} fill="#fff">D</text>
      </g>}
    </svg>
  );
}

/* ---------- small UI bits ---------- */
function Pill({ children, tone = 'neutral', style }) {
  const tones = {
    neutral:{ bg:D.g100, fg:D.fg2 }, navy:{ bg:D.navy, fg:'#fff' }, orange:{ bg:D.orange, fg:'#fff' },
    success:{ bg:D.successBg, fg:D.success }, danger:{ bg:D.dangerBg, fg:D.danger }, warn:{ bg:'#fdf0e3', fg:D.orange600 },
    outline:{ bg:'transparent', fg:D.fg2, box:`inset 0 0 0 1.5px ${D.border}` },
  };
  const t = tones[tone]||tones.neutral;
  return <span style={{ fontFamily:D.body, fontWeight:600, fontSize:11, letterSpacing:'.06em', textTransform:'uppercase',
    padding:'4px 11px', borderRadius:999, background:t.bg, color:t.fg, boxShadow:t.box, display:'inline-flex', alignItems:'center', gap:6, whiteSpace:'nowrap', ...style }}>{children}</span>;
}

function Dot({ color, size=8, pulse }) {
  return <span style={{ position:'relative', display:'inline-block', width:size, height:size }}>
    <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:color }} />
    {pulse && <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:color, animation:'ringPulse 1.8s ease-out infinite' }} />}
  </span>;
}

/* ---------- mock data ---------- */
const PROGRAMS = ['Computer Engineering','Electrical Engineering','Intensive English','Technology Ventures'];
const YEARS = ['Freshman','Sophomore','Junior','Senior','Graduate'];
const FIRST = ['Aïssatou','Mamadou','Fatou','Ousmane','Awa','Cheikh','Mariama','Ibrahima','Khady','Moussa','Ndèye','Abdoulaye','Sokhna','Pape','Bineta','Modou','Rokhaya','Lamine','Astou','Babacar','Coumba','Serigne','Adama','Penda','Saliou','Dieynaba','Malick','Yacine','Souleymane','Mame'];
const LAST = ['Diop','Ndiaye','Fall','Sow','Ba','Sarr','Gueye','Diallo','Faye','Mbaye','Cissé','Sy','Niang','Diouf','Kane','Thiam','Sène','Camara','Touré','Seck','Dieng','Wade','Ndoye','Bâ','Gaye','Diagne'];

function makeStudents(n){
  const rnd = mulberry(20260529);
  const out = [];
  const used = new Set();
  for (let i=0;i<n;i++){
    let name;
    do { name = FIRST[Math.floor(rnd()*FIRST.length)] + ' ' + LAST[Math.floor(rnd()*LAST.length)]; } while (used.has(name) && used.size < FIRST.length*LAST.length);
    used.add(name);
    const id = 'DA' + (240000 + i*7 + Math.floor(rnd()*6)).toString();
    const plan = rnd() > 0.5 ? 'Annual' : 'Semester';
    const r = rnd();
    let status = 'active';
    if (r > 0.92) status = 'expired'; else if (r > 0.86) status = 'pending';
    out.push({
      id, name, program: PROGRAMS[Math.floor(rnd()*PROGRAMS.length)], year: YEARS[Math.floor(rnd()*YEARS.length)],
      plan, status,
      validUntil: plan==='Annual' ? '31 Aug 2026' : '15 Jun 2026',
      mealsToday: { breakfast: rnd()>0.4, lunch: rnd()>0.55, dinner: false },
      room: 'Block ' + 'ABCD'[Math.floor(rnd()*4)] + '-' + (100 + Math.floor(rnd()*120)),
    });
  }
  return out;
}
const STUDENTS = makeStudents(412);

/* curated demo cards for the scanner — explicit scenarios */
const SCAN_DEMO = [
  { ...STUDENTS[3],  name:'Aïssatou Diop',    id:'DA240021', plan:'Annual',   status:'active',  scenario:'ok' },
  { ...STUDENTS[7],  name:'Mamadou Ndiaye',   id:'DA240056', plan:'Semester', status:'active',  scenario:'ok' },
  { ...STUDENTS[12], name:'Fatou Sow',        id:'DA240088', plan:'Annual',   status:'active',  scenario:'already', mealsToday:{breakfast:true,lunch:true,dinner:false} },
  { ...STUDENTS[19], name:'Ousmane Fall',     id:'DA240103', plan:'Semester', status:'expired', validUntil:'15 Jan 2026', scenario:'expired' },
  { ...STUDENTS[24], name:'Awa Guèye',        id:'DA240147', plan:'Semester', status:'pending', scenario:'pending' },
  { ...STUDENTS[31], name:'Cheikh Ba',        id:'DA240199', plan:'Annual',   status:'active',  scenario:'ok' },
];

const MEALS = [
  { key:'breakfast', label:'Breakfast', fr:'Petit-déjeuner', window:'07:00 – 09:00', icon:'coffee' },
  { key:'lunch',     label:'Lunch',     fr:'Déjeuner',       window:'12:00 – 14:30', icon:'utensils' },
  { key:'dinner',    label:'Dinner',    fr:'Dîner',          window:'19:00 – 21:00', icon:'moon' },
];

/* weekend menu — a few dishes per meal */
const WEEKEND_MENU = {
  date: 'Saturday, 31 May 2026',
  meals: [
    { key:'lunch', label:'Lunch', window:'12:00 – 14:30', dishes:[
      { id:'thieb', name:'Thiéboudienne', fr:'Riz au poisson', price:2500, desc:'Senegal’s national dish — jollof-style fish & rice with vegetables.', tag:'Signature' },
      { id:'yassa', name:'Yassa Poulet', fr:'Poulet yassa', price:2000, desc:'Grilled chicken in caramelised onion & lemon sauce, white rice.', tag:'Popular' },
      { id:'maafe', name:'Mafé Bœuf', fr:'Mafé de bœuf', price:2200, desc:'Slow-cooked beef in groundnut (peanut) sauce, served with rice.', tag:'' },
      { id:'veg',   name:'Vegetable Bowl', fr:'Bol végétarien', price:1800, desc:'Seasonal vegetables, couscous & a citrus dressing.', tag:'Veg' },
    ]},
    { key:'dinner', label:'Dinner', window:'19:00 – 21:00', dishes:[
      { id:'dibi', name:'Dibi Agneau', fr:'Agneau grillé', price:3000, desc:'Char-grilled lamb with onions, mustard & attieke.', tag:'Signature' },
      { id:'cebu', name:'Soupou Kandia', fr:'Soupe gombo', price:2400, desc:'Okra & seafood stew over white rice.', tag:'' },
      { id:'pastel', name:'Pastels + Salade', fr:'Pastels & salade', price:1500, desc:'Fried fish pastries with house salad & sauce.', tag:'Light' },
    ]},
  ],
};

const ORDER_STATUS = {
  pending:   { label:'Awaiting payment', tone:'warn',    color:D.orange },
  paid:      { label:'Paid',             tone:'success',  color:D.success },
  preparing: { label:'Preparing',        tone:'navy',     color:D.navy },
  ready:     { label:'Ready for pickup', tone:'orange',   color:D.orange },
  collected: { label:'Collected',        tone:'neutral',  color:D.g500 },
};

function makeOrders(){
  const rnd = mulberry(77);
  const dishes = WEEKEND_MENU.meals.flatMap(m=>m.dishes);
  const statuses = ['paid','preparing','ready','collected','pending','paid','ready','preparing'];
  const out = [];
  for (let i=0;i<14;i++){
    const s = STUDENTS[Math.floor(rnd()*60)+5];
    const d = dishes[Math.floor(rnd()*dishes.length)];
    const qty = 1 + Math.floor(rnd()*2);
    out.push({
      code:'WK-' + (4200 + i*3),
      student:s, item:d, qty, total:d.price*qty,
      method: rnd()>0.5 ? 'Wave' : 'Orange Money',
      status: statuses[i % statuses.length],
      time: ['09:14','09:42','10:03','10:21','10:55','11:08','11:30','08:50','09:01','10:40','11:12','11:45','08:33','09:58'][i],
      meal: d.id==='dibi'||d.id==='cebu'||d.id==='pastel' ? 'Dinner' : 'Lunch',
    });
  }
  return out;
}
const ORDERS = makeOrders();

/* recent scans feed for scanner + admin live */
const RECENT_SCANS = [
  { name:'Bineta Sarr', id:'DA240208', ok:true, t:'12:48' },
  { name:'Modou Sy', id:'DA240231', ok:true, t:'12:47' },
  { name:'Rokhaya Niang', id:'DA240177', ok:false, t:'12:47', reason:'Already served' },
  { name:'Lamine Diouf', id:'DA240290', ok:true, t:'12:46' },
  { name:'Astou Kane', id:'DA240115', ok:true, t:'12:46' },
  { name:'Babacar Thiam', id:'DA240302', ok:true, t:'12:45' },
];

function currentMealKey(){
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 17) return 'lunch';
  return 'dinner';
}

/* ---------- finances ---------- */
const PLAN_PRICES = { Annual: 360000, Semester: 200000 };
const COST_PER_MEAL = 720;          // FCFA — food + operating cost per served meal
const FEES = { 'Wave': 0.01, 'Orange Money': 0.012, 'Bank transfer': 0, 'Cash': 0 };

/* aggregate term finances derived from STUDENTS */
function termFinances(){
  let planRevenue = 0, outstanding = 0;
  STUDENTS.forEach(s=>{
    const price = PLAN_PRICES[s.plan];
    if (s.status === 'active') planRevenue += price;
    else outstanding += price;
  });
  const weekendRevenue = 1860000;   // accumulated this term
  const mealsServedTerm = 84120;
  const foodCost = mealsServedTerm * COST_PER_MEAL;
  const revenue = planRevenue + weekendRevenue;
  return { planRevenue, weekendRevenue, outstanding, revenue, mealsServedTerm, foodCost, margin: revenue - foodCost };
}

/* monthly revenue trend (term: Jan–May 2026) */
const REV_TREND = [
  { m:'Jan', plan:38600000, weekend:280000 },
  { m:'Feb', plan:4200000,  weekend:412000 },
  { m:'Mar', plan:2100000,  weekend:388000 },
  { m:'Apr', plan:1600000,  weekend:421000 },
  { m:'May', plan:2800000,  weekend:359000 },
];

/* mobile-money settlement (uncollected balances awaiting payout) */
const SETTLEMENT = [
  { provider:'Wave',         color:'#1dc3ff', balance:642000, fee:6420,  account:'DAUST Dining · 77 488 25 15' },
  { provider:'Orange Money', color:'#ff7900', balance:418500, fee:5022,  account:'DAUST Dining · 78 120 44 90' },
];

const TXN_TYPES = {
  plan:    { label:'Meal plan', tone:'navy',    color:D.navy700, icon:'badge-check' },
  weekend: { label:'Weekend order', tone:'orange', color:D.orange, icon:'utensils' },
  refund:  { label:'Refund', tone:'danger',  color:D.danger, icon:'corner-up-left' },
};

function makeTransactions(){
  const rnd = mulberry(909);
  const methods = ['Wave','Orange Money','Bank transfer','Cash'];
  const out = [];
  const days = ['Today, 11:42','Today, 10:18','Today, 09:05','Yesterday, 19:22','Yesterday, 14:50','Yesterday, 12:08','27 May, 20:15','27 May, 13:30','27 May, 08:44','26 May, 19:51','26 May, 12:40','26 May, 09:12','25 May, 18:33','25 May, 13:02','24 May, 12:21','24 May, 09:48','23 May, 19:07','23 May, 12:55','22 May, 14:10','22 May, 08:39'];
  for (let i=0;i<days.length;i++){
    const s = STUDENTS[Math.floor(rnd()*120)+3];
    const roll = rnd();
    let type = 'weekend', amount, method, status='completed';
    if (roll > 0.8){ type='plan'; amount = rnd()>0.5?PLAN_PRICES.Semester:PLAN_PRICES.Annual; method = rnd()>0.5?'Bank transfer':(rnd()>0.5?'Wave':'Orange Money'); }
    else if (roll > 0.74){ type='refund'; amount = -[1500,2000,2500][Math.floor(rnd()*3)]; method='Wave'; status='refunded'; }
    else { type='weekend'; amount = [1500,1800,2000,2200,2400,2500,3000][Math.floor(rnd()*7)]; method = rnd()>0.5?'Wave':'Orange Money'; if (rnd()>0.9) status='pending'; }
    out.push({ id:'TXN-'+(90400+i*3), student:s, type, amount, method, status, when:days[i] });
  }
  return out;
}
const TRANSACTIONS = makeTransactions();

Object.assign(window, { PLAN_PRICES, COST_PER_MEAL, FEES, termFinances, REV_TREND, SETTLEMENT, TXN_TYPES, TRANSACTIONS });

Object.assign(window, {
  D, hashStr, mulberry, fcfa, fcfaShort, initials, cx, AVATAR_BG,
  Icon, TriDash, Avatar, QRCode, Pill, Dot,
  PROGRAMS, YEARS, STUDENTS, SCAN_DEMO, MEALS, WEEKEND_MENU, ORDER_STATUS, ORDERS, RECENT_SCANS, currentMealKey,
});


/* ===== Scanner.jsx ===== */
/* ============================================================
   DAUST Dining — Scanner Station (entrance tablet, landscape)
   ============================================================ */

function beep(ok){
  try {
    const ac = beep._ac || (beep._ac = new (window.AudioContext||window.webkitAudioContext)());
    const t = ac.currentTime;
    if (ok){
      [659.25, 880].forEach((f,i)=>{ const o=ac.createOscillator(),g=ac.createGain(); o.type='sine'; o.frequency.value=f; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0,t+i*0.09); g.gain.linearRampToValueAtTime(0.16,t+i*0.09+0.01); g.gain.exponentialRampToValueAtTime(0.001,t+i*0.09+0.18); o.start(t+i*0.09); o.stop(t+i*0.09+0.2); });
    } else {
      const o=ac.createOscillator(),g=ac.createGain(); o.type='square'; o.frequency.value=160; o.connect(g); g.connect(ac.destination); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.12,t+0.01); g.gain.exponentialRampToValueAtTime(0.001,t+0.32); o.start(t); o.stop(t+0.34);
    }
  } catch(e){}
}

function evaluate(stu, mealKey){
  if (stu.status === 'expired') return { ok:false, code:'EXPIRED', reason:`Meal plan expired · ${stu.validUntil}`, override:false };
  if (stu.status === 'pending') return { ok:false, code:'UNPAID', reason:'Payment not confirmed for this term', override:true };
  if (stu.mealsToday && stu.mealsToday[mealKey]) return { ok:false, code:'SERVED', reason:`Already served ${mealKey} today`, override:true };
  return { ok:true, code:'OK', reason:'Meal plan active · '+stu.plan };
}

function ScannerStation({ onExit, resultStyle = 'flood', sound = true }){
  const [mealKey, setMealKey] = React.useState(currentMealKey());
  const meal = MEALS.find(m=>m.key===mealKey);
  const [served, setServed] = React.useState(247);
  const [denied, setDenied] = React.useState(8);
  const [feed, setFeed] = React.useState(RECENT_SCANS);
  const [scanning, setScanning] = React.useState(false);
  const [result, setResult] = React.useState(null); // {stu, eval, overridden}
  const timer = React.useRef(null);

  const now = new Date();
  const clock = now.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});

  function runScan(stu){
    if (scanning || result) return;
    setScanning(true);
    setTimeout(()=>{
      setScanning(false);
      const ev = evaluate(stu, mealKey);
      if (sound) beep(ev.ok);
      setResult({ stu, ev, overridden:false });
      setFeed(f => [{ name:stu.name, id:stu.id, ok:ev.ok, t:clock, reason: ev.ok?null:ev.reason }, ...f].slice(0,7));
      if (ev.ok) setServed(s=>s+1); else setDenied(s=>s+1);
      clearTimeout(timer.current);
      timer.current = setTimeout(()=>setResult(null), ev.ok ? 2600 : 4200);
    }, 850);
  }
  function override(){
    setResult(r => ({ ...r, overridden:true, ev:{...r.ev, ok:true} }));
    setServed(s=>s+1); setDenied(s=>Math.max(0,s-1));
    setFeed(f => { const [first,...rest]=f; return [{...first, ok:true, reason:'Override'}, ...rest]; });
    clearTimeout(timer.current); timer.current = setTimeout(()=>setResult(null), 1800);
  }
  function dismiss(){ clearTimeout(timer.current); setResult(null); }

  return (
    <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', background:D.subtle, position:'relative', overflow:'hidden', fontFamily:D.body }}>
      {/* top bar */}
      <div style={{ height:74, background:D.navy, display:'flex', alignItems:'center', padding:'0 26px', gap:22, flexShrink:0, boxShadow:'0 2px 14px rgba(15,44,80,.3)' }}>
        <img src="assets/logo-daust-white.png" alt="DAUST" style={{ height:30 }} />
        <div style={{ width:1, height:30, background:'rgba(255,255,255,.16)' }} />
        <div style={{ color:'#fff', fontFamily:D.display, fontWeight:600, fontSize:16, letterSpacing:'.02em' }}>Dining Entrance · <span style={{ color:D.onNavyMuted, fontWeight:500 }}>Main Hall</span></div>

        {/* meal segmented control */}
        <div style={{ marginLeft:'auto', display:'flex', gap:4, background:'rgba(255,255,255,.08)', padding:4, borderRadius:999 }}>
          {MEALS.map(m=>(
            <button key={m.key} onClick={()=>setMealKey(m.key)} style={{ border:'none', cursor:'pointer', borderRadius:999, padding:'8px 16px',
              background: mealKey===m.key ? D.orange : 'transparent', color: mealKey===m.key ? '#fff' : D.onNavyMuted,
              fontFamily:D.body, fontWeight:600, fontSize:13, letterSpacing:'.02em', display:'flex', alignItems:'center', gap:7, transition:'.15s' }}>
              <Icon name={m.icon} size={15} /> {m.label}
            </button>
          ))}
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2, color:'#fff', minWidth:96 }}>
          <div style={{ fontFamily:D.mono, fontWeight:600, fontSize:18, letterSpacing:'.04em' }}>{clock}</div>
          <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:D.onNavyMuted }}><Dot color="#4ade80" size={7} pulse /> Online</div>
        </div>
        <button onClick={onExit} title="Exit station" style={{ border:'none', background:'rgba(255,255,255,.1)', color:'#fff', width:38, height:38, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="x" size={18} /></button>
      </div>

      {/* body */}
      <div style={{ flex:1, display:'flex', minHeight:0 }}>
        {/* left: viewfinder */}
        <div style={{ flex:1, padding:'26px 24px', display:'flex', flexDirection:'column', minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'baseline', gap:12, marginBottom:14 }}>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:24, color:D.fg1 }}>Scan student QR</div>
            <Pill tone="warn"><Icon name={meal.icon} size={12} /> {meal.label} · {meal.window}</Pill>
          </div>

          {/* camera */}
          <div style={{ flex:1, borderRadius:18, position:'relative', overflow:'hidden', minHeight:0,
            background:'radial-gradient(120% 120% at 50% 30%, #1a2733 0%, #0c151d 100%)', boxShadow:'inset 0 0 80px rgba(0,0,0,.5)' }}>
            <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(255,255,255,.05) 1px, transparent 1px)', backgroundSize:'22px 22px' }} />
            {/* reticle */}
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:'min(46%, 270px)', aspectRatio:'1', }}>
              {['tl','tr','bl','br'].map(c=>{ const v={ tl:{top:0,left:0}, tr:{top:0,right:0}, bl:{bottom:0,left:0}, br:{bottom:0,right:0} }[c];
                const bw = (s)=>c.includes(s); return (
                <span key={c} style={{ position:'absolute', width:42, height:42, ...v,
                  borderTop: bw('t')?`4px solid ${D.orange}`:'none', borderBottom: bw('b')?`4px solid ${D.orange}`:'none',
                  borderLeft: bw('l')?`4px solid ${D.orange}`:'none', borderRight: bw('r')?`4px solid ${D.orange}`:'none',
                  borderTopLeftRadius: c==='tl'?14:0, borderTopRightRadius:c==='tr'?14:0, borderBottomLeftRadius:c==='bl'?14:0, borderBottomRightRadius:c==='br'?14:0 }} />
              );})}
              {scanning && <div style={{ position:'absolute', left:'4%', right:'4%', height:3, borderRadius:999, background:`linear-gradient(90deg, transparent, ${D.orange}, transparent)`, boxShadow:`0 0 16px ${D.orange}`, animation:'scanSweep 1.1s ease-in-out infinite' }} />}
              <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', opacity:.5 }}>
                <Icon name={scanning?'loader':'qr-code'} size={56} color="rgba(255,255,255,.5)" />
              </div>
            </div>
            <div style={{ position:'absolute', bottom:20, left:0, right:0, textAlign:'center', color:'rgba(255,255,255,.62)', fontSize:14, letterSpacing:'.02em' }}>
              {scanning ? 'Reading code…' : 'Hold the student’s QR code inside the frame'}
            </div>
          </div>

          {/* demo scan chips */}
          <div style={{ marginTop:16 }}>
            <div style={{ fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:D.fg3, fontWeight:600, marginBottom:9, display:'flex', alignItems:'center', gap:7 }}>
              <Icon name="hand" size={13} /> Demo · tap a student to simulate a scan
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {SCAN_DEMO.map(s=>{ const ev=evaluate(s, mealKey);
                return <button key={s.id} onClick={()=>runScan(s)} disabled={scanning||!!result} style={{ cursor:'pointer', border:`1.5px solid ${D.border}`, background:'#fff', borderRadius:999, padding:'7px 13px 7px 7px', display:'flex', alignItems:'center', gap:9, fontFamily:D.body, transition:'.14s', opacity: (scanning||result)?0.5:1 }}
                  onMouseEnter={e=>!scanning&&!result&&(e.currentTarget.style.borderColor=D.navy)} onMouseLeave={e=>e.currentTarget.style.borderColor=D.border}>
                  <Avatar name={s.name} size={30} />
                  <span style={{ textAlign:'left' }}>
                    <span style={{ display:'block', fontSize:12.5, fontWeight:600, color:D.fg1, lineHeight:1.1 }}>{s.name.split(' ')[0]} {s.name.split(' ')[1]?.[0]}.</span>
                    <span style={{ display:'block', fontSize:10.5, color: ev.ok?D.success:D.danger, fontWeight:600 }}>{ev.ok?'Eligible':ev.code}</span>
                  </span>
                </button>; })}
            </div>
          </div>
        </div>

        {/* right: live panel */}
        <div style={{ width:312, flexShrink:0, background:'#fff', borderLeft:`1px solid ${D.border}`, display:'flex', flexDirection:'column', padding:'22px 20px' }}>
          <div style={{ display:'flex', gap:12, marginBottom:18 }}>
            <div style={{ flex:1, background:D.successBg, borderRadius:14, padding:'14px 16px' }}>
              <div style={{ fontFamily:D.display, fontWeight:800, fontSize:34, color:D.success, lineHeight:1 }}>{served}</div>
              <div style={{ fontSize:11.5, color:D.fg2, fontWeight:600, marginTop:4 }}>Served · {meal.label}</div>
            </div>
            <div style={{ flex:1, background:D.dangerBg, borderRadius:14, padding:'14px 16px' }}>
              <div style={{ fontFamily:D.display, fontWeight:800, fontSize:34, color:D.danger, lineHeight:1 }}>{denied}</div>
              <div style={{ fontSize:11.5, color:D.fg2, fontWeight:600, marginTop:4 }}>Turned away</div>
            </div>
          </div>
          <div style={{ fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:D.fg3, fontWeight:600, marginBottom:10 }}>Recent scans</div>
          <div className="scroll" style={{ flex:1, display:'flex', flexDirection:'column', gap:7, minHeight:0 }}>
            {feed.map((f,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 10px', borderRadius:10, background: i===0?D.subtle:'transparent', animation: i===0?'fadeUp .3s ease':'none' }}>
                <div style={{ width:28, height:28, borderRadius:'50%', display:'grid', placeItems:'center', flexShrink:0, background: f.ok?D.successBg:D.dangerBg, color: f.ok?D.success:D.danger }}>
                  <Icon name={f.ok?'check':'x'} size={15} strokeWidth={2.6} />
                </div>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:600, color:D.fg1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{f.name}</div>
                  <div style={{ fontSize:11, color:D.fg3 }}>{f.ok ? f.id : f.reason}</div>
                </div>
                <div className="mono" style={{ fontSize:11, color:D.fg3 }}>{f.t}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RESULT overlay */}
      {result && <ScanResult key={result.stu.id+result.overridden} data={result} meal={meal} style={resultStyle} onOverride={override} onDismiss={dismiss} />}
    </div>
  );
}

function ScanResult({ data, meal, style, onOverride, onDismiss }){
  const { stu, ev, overridden } = data;
  const ok = ev.ok;
  const accent = ok ? D.success : D.danger;

  const Identity = ({ light }) => (
    <div style={{ display:'flex', alignItems:'center', gap:18 }}>
      <Avatar name={stu.name} size={84} ring={ light ? 'rgba(255,255,255,.5)' : 'rgba(0,0,0,.06)'} />
      <div style={{ textAlign:'left' }}>
        <div style={{ fontFamily:D.display, fontWeight:800, fontSize:30, lineHeight:1.05, color: light?'#fff':D.fg1 }}>{stu.name}</div>
        <div className="mono" style={{ fontSize:14, color: light?'rgba(255,255,255,.8)':D.fg2, marginTop:4 }}>{stu.id} · {stu.program}</div>
      </div>
    </div>
  );
  const Reason = ({ light }) => (
    <div style={{ fontSize:16, fontWeight:600, color: light?'rgba(255,255,255,.92)':D.fg2, marginTop:4 }}>
      {overridden ? 'Manual override approved by staff' : ev.reason}
    </div>
  );
  const Symbol = ({ size=120, light }) => (
    <div style={{ position:'relative', width:size, height:size, display:'grid', placeItems:'center' }}>
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', background: light?'rgba(255,255,255,.18)':accent+'1a' }} />
      <span style={{ position:'absolute', inset:0, borderRadius:'50%', border:`3px solid ${light?'rgba(255,255,255,.45)':accent}`, animation:'ringPulse 1.6s ease-out infinite' }} />
      <svg width={size*0.5} height={size*0.5} viewBox="0 0 52 52">
        {ok
          ? <path d="M14 27 l8 8 l16 -18" fill="none" stroke={light?'#fff':accent} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray:60, strokeDashoffset:60, animation:'drawCheck .4s .12s ease forwards' }} />
          : <g stroke={light?'#fff':accent} strokeWidth="6" strokeLinecap="round"><line x1="16" y1="16" x2="36" y2="36" /><line x1="36" y1="16" x2="16" y2="36" /></g>}
      </svg>
    </div>
  );

  // FLOOD — full color takeover
  if (style === 'flood'){
    return (
      <div onClick={onDismiss} style={{ position:'absolute', inset:0, zIndex:30, display:'grid', placeItems:'center', cursor:'pointer',
        background: ok ? `linear-gradient(160deg, #2e7d52, #1f5e3c)` : `linear-gradient(160deg, #c0392b, #8f2317)`, animation: ok?'fadeIn .18s ease':'fadeIn .18s ease' }}>
        <div style={{ textAlign:'center', animation: ok?'popIn .4s ease':'shakeX .5s ease', display:'flex', flexDirection:'column', alignItems:'center', gap:22, padding:30 }}>
          <Symbol light />
          <div>
            <div style={{ fontFamily:D.display, fontWeight:800, fontSize:60, color:'#fff', letterSpacing:'.04em', lineHeight:1 }}>{ok ? (overridden?'LET IN':'GO') : 'STOP'}</div>
            <div style={{ fontSize:17, color:'rgba(255,255,255,.85)', fontWeight:600, marginTop:6, letterSpacing:'.02em' }}>{ok ? (overridden?'Override approved':'Bon appétit · '+meal.label) : ev.code}</div>
          </div>
          <div style={{ background:'rgba(255,255,255,.13)', borderRadius:18, padding:'18px 26px', backdropFilter:'blur(4px)' }} onClick={e=>e.stopPropagation()}>
            <Identity light />
            <Reason light />
          </div>
          {!ok && ev.override && !overridden && (
            <button onClick={(e)=>{ e.stopPropagation(); onOverride(); }} className="btn" style={{ background:'#fff', color:accent, fontWeight:700, padding:'13px 28px' }}>
              <Icon name="shield-check" size={17} /> Staff override · let in
            </button>
          )}
          <div style={{ fontSize:12.5, color:'rgba(255,255,255,.6)' }}>Tap anywhere to continue</div>
        </div>
      </div>
    );
  }

  // CARD — focused card on dim
  if (style === 'card'){
    return (
      <div onClick={onDismiss} style={{ position:'absolute', inset:0, zIndex:30, display:'grid', placeItems:'center', cursor:'pointer', background:'rgba(12,21,34,.55)', backdropFilter:'blur(6px)', animation:'fadeIn .16s ease' }}>
        <div onClick={e=>e.stopPropagation()} style={{ width:480, maxWidth:'88%', background:'#fff', borderRadius:24, overflow:'hidden', boxShadow:D.navy && '0 30px 80px rgba(0,0,0,.4)', animation: ok?'popIn .38s ease':'shakeX .5s ease', cursor:'default' }}>
          <div style={{ background:accent, padding:'30px 0 26px', display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
            <Symbol light size={104} />
            <div style={{ fontFamily:D.display, fontWeight:800, fontSize:40, color:'#fff', letterSpacing:'.05em' }}>{ok ? (overridden?'LET IN':'CLEAR TO EAT') : 'DENIED'}</div>
          </div>
          <div style={{ padding:'24px 28px 26px', display:'flex', flexDirection:'column', gap:16 }}>
            <Identity />
            <div style={{ height:1, background:D.border }} />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:11, letterSpacing:'.08em', textTransform:'uppercase', color:D.fg3, fontWeight:600 }}>Status</div>
                <Reason />
              </div>
              <Pill tone={ok?'success':'danger'}>{ok?'Eligible':ev.code}</Pill>
            </div>
            {!ok && ev.override && !overridden && (
              <button onClick={onOverride} className="btn btn-navy" style={{ width:'100%', padding:'13px' }}><Icon name="shield-check" size={17} /> Staff override · let in</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // BANNER — top slide-in, keeps camera visible
  return (
    <div onClick={onDismiss} style={{ position:'absolute', inset:0, zIndex:30, cursor:'pointer' }}>
      <div onClick={e=>e.stopPropagation()} style={{ position:'absolute', top:90, left:'50%', transform:'translateX(-50%)', width:'min(640px,88%)', background:'#fff', borderRadius:18, boxShadow:'0 24px 60px rgba(0,0,0,.35)', overflow:'hidden', animation:'fadeUp .26s ease', cursor:'default', borderTop:`5px solid ${accent}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:18, padding:'18px 22px' }}>
          <div style={{ width:64, height:64, borderRadius:16, background:ok?D.successBg:D.dangerBg, display:'grid', placeItems:'center', flexShrink:0, color:accent }}>
            <Icon name={ok?'check':'x'} size={34} strokeWidth={2.6} />
          </div>
          <Avatar name={stu.name} size={56} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:22, color:D.fg1 }}>{stu.name}</div>
            <div style={{ fontSize:13.5, color:ok?D.success:D.danger, fontWeight:600 }}>{ok?(overridden?'Override approved':'Clear to eat · '+meal.label):ev.reason}</div>
          </div>
          {!ok && ev.override && !overridden
            ? <button onClick={onOverride} className="btn btn-navy" style={{ padding:'11px 18px' }}><Icon name="shield-check" size={15} /> Override</button>
            : <div style={{ fontFamily:D.display, fontWeight:800, fontSize:30, color:accent, letterSpacing:'.04em' }}>{ok?'GO':'STOP'}</div>}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScannerStation });


/* ===== Student.jsx ===== */
/* ============================================================
   DAUST Dining — Student app (phone)
   ============================================================ */

const ME = { name:'Aïssatou Diop', first:'Aïssatou', id:'DA240021', program:'Computer Engineering', year:'Junior',
  plan:'Annual', status:'active', validUntil:'31 Aug 2026', balance:6500,
  meals:{ breakfast:{done:true, t:'07:42'}, lunch:{done:false}, dinner:{done:false} } };

function StudentApp({ onExit, payStyle='sheet' }){
  const [tab, setTab] = React.useState('home');
  const [cart, setCart] = React.useState({}); // dishId -> qty
  const [overlay, setOverlay] = React.useState(null); // 'pass' | 'checkout' | {order}
  const [orders, setOrders] = React.useState([
    { code:'WK-4188', item:WEEKEND_MENU.meals[0].dishes[1], qty:1, total:2000, method:'Wave', status:'ready', meal:'Lunch', time:'Last Saturday' },
    { code:'WK-4102', item:WEEKEND_MENU.meals[1].dishes[0], qty:1, total:3000, method:'Orange Money', status:'collected', meal:'Dinner', time:'2 weeks ago' },
  ]);
  const dishes = WEEKEND_MENU.meals.flatMap(m=>m.dishes);
  const cartItems = Object.entries(cart).filter(([,q])=>q>0).map(([id,q])=>({ dish:dishes.find(d=>d.id===id), q }));
  const cartTotal = cartItems.reduce((s,c)=>s+c.dish.price*c.q,0);
  const cartCount = cartItems.reduce((s,c)=>s+c.q,0);

  function add(id,delta){ setCart(c=>({ ...c, [id]: Math.max(0,(c[id]||0)+delta) })); }

  function placeOrder(method){
    const items = cartItems;
    const code = 'WK-' + (4200 + Math.floor(Math.random()*90));
    const main = items[0];
    const order = { code, item:main.dish, qty:main.q, total:cartTotal, method, status:'paid', meal: main.dish.id.match(/dibi|cebu|pastel/)?'Dinner':'Lunch', time:'Just now', extra: items.length-1 };
    setOrders(o=>[order,...o]); setCart({}); setOverlay({ type:'success', order });
    setTimeout(()=>{ setOrders(o=>o.map(x=>x.code===code?{...x,status:'preparing'}:x)); }, 4000);
  }

  return (
    <div style={{ width:'100%', height:'100%', background:D.subtle, position:'relative', overflow:'hidden', fontFamily:D.body, display:'flex', flexDirection:'column' }}>
      {/* scrollable content */}
      <div className="scroll" style={{ flex:1, minHeight:0 }}>
        {tab==='home' && <StudentHome onPass={()=>setOverlay({type:'pass'})} onWeekend={()=>setTab('weekend')} onPlan={()=>setOverlay({type:'plan'})} onExit={onExit} />}
        {tab==='weekend' && <StudentWeekend cart={cart} add={add} />}
        {tab==='orders' && <StudentOrders orders={orders} onOpen={o=>setOverlay({type:'detail',order:o})} />}
      </div>

      {/* cart bar */}
      {tab==='weekend' && cartCount>0 && !overlay && (
        <div style={{ position:'absolute', left:14, right:14, bottom:74, animation:'fadeUp .25s ease', zIndex:5 }}>
          <button onClick={()=>setOverlay({type:'checkout'})} className="btn btn-orange" style={{ width:'100%', padding:'15px 20px', justifyContent:'space-between', boxShadow:D.navy && '0 12px 30px rgba(237,132,37,.4)' }}>
            <span style={{ display:'flex', alignItems:'center', gap:9 }}><span style={{ background:'rgba(255,255,255,.25)', borderRadius:999, padding:'2px 9px', fontWeight:700 }}>{cartCount}</span> View order</span>
            <span style={{ fontWeight:700 }}>{fcfa(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* bottom nav */}
      <div style={{ height:64, background:'#fff', borderTop:`1px solid ${D.border}`, display:'flex', flexShrink:0, paddingBottom:'env(safe-area-inset-bottom)' }}>
        {[['home','Home','home'],['weekend','Weekend','utensils'],['orders','Orders','receipt']].map(([k,label,icon])=>(
          <button key={k} onClick={()=>setTab(k)} style={{ flex:1, border:'none', background:'transparent', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, color: tab===k?D.navy:D.g400, position:'relative' }}>
            <Icon name={icon} size={21} strokeWidth={tab===k?2.4:2} />
            <span style={{ fontSize:10.5, fontWeight:600 }}>{label}</span>
            {k==='orders' && orders.some(o=>o.status==='ready') && <span style={{ position:'absolute', top:8, right:'calc(50% - 16px)', width:7, height:7, borderRadius:'50%', background:D.orange }} />}
          </button>
        ))}
      </div>

      {/* overlays */}
      {overlay?.type==='pass' && <PassOverlay onClose={()=>setOverlay(null)} />}
      {overlay?.type==='plan' && <PlanManager onClose={()=>setOverlay(null)} />}
      {overlay?.type==='checkout' && <CheckoutFlow items={cartItems} total={cartTotal} payStyle={payStyle} onClose={()=>setOverlay(null)} onPay={placeOrder} />}
      {overlay?.type==='success' && <OrderSuccess order={overlay.order} onClose={()=>{ setOverlay(null); setTab('orders'); }} />}
      {overlay?.type==='detail' && <OrderDetail order={overlay.order} onClose={()=>setOverlay(null)} />}
    </div>
  );
}

/* ---------- Home ---------- */
function StudentHome({ onPass, onWeekend, onPlan, onExit }){
  const mealList = MEALS.map(m=>({ ...m, state: ME.meals[m.key] }));
  const cur = currentMealKey();
  return (
    <div>
      {/* header */}
      <div style={{ background:`linear-gradient(160deg, ${D.navy}, ${D.navyDeep})`, padding:'52px 20px 26px', color:'#fff', position:'relative' }}>
        <button onClick={onExit} style={{ position:'absolute', top:48, right:18, border:'none', background:'rgba(255,255,255,.12)', color:'#fff', width:34, height:34, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="x" size={16} /></button>
        <div style={{ display:'flex', alignItems:'center', gap:13 }}>
          <Avatar name={ME.name} size={48} ring="rgba(255,255,255,.25)" />
          <div>
            <div style={{ fontSize:13, color:D.onNavyMuted }}>Bonjour,</div>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:22, lineHeight:1.1 }}>{ME.first}</div>
          </div>
        </div>
        {/* plan card */}
        <button onClick={onPlan} style={{ width:'100%', textAlign:'left', cursor:'pointer', marginTop:20, background:'rgba(255,255,255,.1)', border:'1px solid rgba(255,255,255,.14)', borderRadius:16, padding:'16px 18px', color:'#fff' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:11.5, letterSpacing:'.1em', textTransform:'uppercase', color:D.onNavyMuted, fontWeight:600 }}>Meal Plan</div>
            <Pill tone="success"><Dot color={D.success} size={6} /> Active</Pill>
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', justifyContent:'space-between', marginTop:10 }}>
            <div>
              <div style={{ fontFamily:D.display, fontWeight:800, fontSize:24 }}>{ME.plan} Plan</div>
              <div style={{ fontSize:12, color:D.onNavyMuted, marginTop:2, display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>Valid until {ME.validUntil} <Icon name="chevron-right" size={14} color={D.onNavyMuted} /></div>
            </div>
            <TriDash w={20} />
          </div>
        </button>
      </div>

      <div style={{ padding:'18px 20px 30px' }}>
        {/* pass button */}
        <button onClick={onPass} style={{ width:'100%', border:`1.5px solid ${D.border}`, background:'#fff', borderRadius:16, padding:'16px 18px', display:'flex', alignItems:'center', gap:14, cursor:'pointer', boxShadow:'var(--shadow-sm)', marginBottom:22 }}>
          <div style={{ width:52, height:52, borderRadius:12, background:D.navy, display:'grid', placeItems:'center', flexShrink:0 }}><Icon name="qr-code" size={28} color="#fff" /></div>
          <div style={{ flex:1, textAlign:'left' }}>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:17, color:D.fg1 }}>My Dining Pass</div>
            <div style={{ fontSize:12.5, color:D.fg3 }}>Show this QR at the entrance</div>
          </div>
          <Icon name="chevron-right" size={20} color={D.g400} />
        </button>

        {/* today meals */}
        <div className="eyebrow" style={{ marginBottom:12 }}>Today · Mon 29 May</div>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {mealList.map(m=>{ const done=m.state?.done; const isNow = m.key===cur && !done;
            return (
            <div key={m.key} style={{ background:'#fff', border:`1.5px solid ${isNow?D.orange:D.border}`, borderRadius:14, padding:'13px 15px', display:'flex', alignItems:'center', gap:13 }}>
              <div style={{ width:40, height:40, borderRadius:10, background: done?D.successBg:D.subtle, display:'grid', placeItems:'center', color: done?D.success:D.fg2 }}>
                <Icon name={done?'check':m.icon} size={19} strokeWidth={done?2.6:2} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:600, fontSize:15, color:D.fg1 }}>{m.label}</div>
                <div style={{ fontSize:12, color:D.fg3 }}>{m.window}</div>
              </div>
              {done ? <Pill tone="success">Served {m.state.t}</Pill> : isNow ? <Pill tone="warn">Open now</Pill> : <span style={{ fontSize:12, color:D.g400, fontWeight:600 }}>Upcoming</span>}
            </div>
          );})}
        </div>

        {/* weekend teaser */}
        <button onClick={onWeekend} style={{ width:'100%', marginTop:22, border:'none', borderRadius:16, padding:'18px 20px', cursor:'pointer', textAlign:'left', position:'relative', overflow:'hidden',
          background:`linear-gradient(120deg, ${D.orange}, ${D.orange600})`, color:'#fff' }}>
          <div style={{ position:'absolute', right:-10, top:-10, opacity:.18 }}><Icon name="utensils-crossed" size={96} color="#fff" /></div>
          <div style={{ fontSize:11.5, letterSpacing:'.1em', textTransform:'uppercase', fontWeight:700, opacity:.9 }}>Weekend Menu</div>
          <div style={{ fontFamily:D.display, fontWeight:800, fontSize:21, marginTop:5, maxWidth:'80%' }}>Order & pay for Saturday meals</div>
          <div style={{ fontSize:13, marginTop:6, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>Browse menu <Icon name="arrow-right" size={15} /></div>
        </button>
      </div>
    </div>
  );
}

/* ---------- Weekend menu ---------- */
function StudentWeekend({ cart, add }){
  return (
    <div>
      <div style={{ background:D.navy, padding:'52px 20px 22px', color:'#fff' }}>
        <div className="eyebrow" style={{ color:D.orange }}>Weekend Dining</div>
        <div style={{ fontFamily:D.display, fontWeight:800, fontSize:24, marginTop:5 }}>This Weekend</div>
        <div style={{ fontSize:13, color:D.onNavyMuted, marginTop:3, display:'flex', alignItems:'center', gap:7 }}><Icon name="calendar" size={14} /> {WEEKEND_MENU.date}</div>
      </div>
      <div style={{ padding:'18px 16px 90px' }}>
        {WEEKEND_MENU.meals.map(meal=>(
          <div key={meal.key} style={{ marginBottom:24 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
              <div style={{ fontFamily:D.display, fontWeight:700, fontSize:18, color:D.fg1 }}>{meal.label}</div>
              <div style={{ fontSize:12, color:D.fg3, whiteSpace:'nowrap' }}>{meal.window}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {meal.dishes.map(d=>{ const q=cart[d.id]||0;
                return (
                <div key={d.id} style={{ background:'#fff', borderRadius:14, overflow:'hidden', border:`1px solid ${D.border}`, boxShadow:'var(--shadow-sm)' }}>
                  <div style={{ height:96, position:'relative', background:`linear-gradient(135deg, ${D.navy} 0%, ${D.navy700} 70%, ${D.orange600} 140%)` }}>
                    <div style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize:'16px 16px' }} />
                    <div style={{ position:'absolute', left:12, bottom:10, display:'flex', alignItems:'center', gap:6, color:'rgba(255,255,255,.7)', fontSize:11.5 }}><Icon name="image" size={13} /> Dish photo</div>
                    {d.tag && <span style={{ position:'absolute', top:10, right:10 }}><Pill tone={d.tag==='Veg'?'success':'orange'}>{d.tag}</Pill></span>}
                  </div>
                  <div style={{ padding:'13px 15px 15px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', gap:10, alignItems:'flex-start' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontFamily:D.display, fontWeight:700, fontSize:16.5, color:D.fg1, lineHeight:1.18 }}>{d.name}</div>
                        <div style={{ fontSize:12, color:D.fg3, fontStyle:'italic', marginTop:2 }}>{d.fr}</div>
                      </div>
                      <div style={{ fontFamily:D.display, fontWeight:800, fontSize:16, color:D.navy, whiteSpace:'nowrap', flexShrink:0 }}>{d.price.toLocaleString('fr-FR')} <span style={{ fontSize:11, color:D.fg3 }}>F</span></div>
                    </div>
                    <p style={{ fontSize:12.5, color:D.fg2, lineHeight:1.5, margin:'8px 0 12px' }}>{d.desc}</p>
                    {q===0
                      ? <button onClick={()=>add(d.id,1)} className="btn btn-outline" style={{ width:'100%', padding:'10px' }}><Icon name="plus" size={16} /> Add to order</button>
                      : <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', background:D.subtle, borderRadius:999, padding:4 }}>
                          <button onClick={()=>add(d.id,-1)} style={{ width:38, height:38, borderRadius:999, border:'none', background:'#fff', cursor:'pointer', display:'grid', placeItems:'center', boxShadow:'var(--shadow-sm)' }}><Icon name="minus" size={16} color={D.navy} /></button>
                          <span style={{ fontFamily:D.display, fontWeight:700, fontSize:17, color:D.fg1 }}>{q}</span>
                          <button onClick={()=>add(d.id,1)} style={{ width:38, height:38, borderRadius:999, border:'none', background:D.navy, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="plus" size={16} color="#fff" /></button>
                        </div>}
                  </div>
                </div>
              );})}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- Orders list ---------- */
function StudentOrders({ orders, onOpen }){
  return (
    <div>
      <div style={{ background:D.navy, padding:'52px 20px 22px', color:'#fff' }}>
        <div className="eyebrow" style={{ color:D.orange }}>My Orders</div>
        <div style={{ fontFamily:D.display, fontWeight:800, fontSize:24, marginTop:5 }}>Weekend Orders</div>
      </div>
      <div style={{ padding:'18px 16px 30px', display:'flex', flexDirection:'column', gap:12 }}>
        {orders.map(o=>{ const st=ORDER_STATUS[o.status];
          return (
          <button key={o.code} onClick={()=>onOpen(o)} style={{ background:'#fff', border:`1px solid ${D.border}`, borderRadius:14, padding:'14px 15px', cursor:'pointer', textAlign:'left', boxShadow:'var(--shadow-sm)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:9 }}>
              <span className="mono" style={{ fontSize:12, color:D.fg3, fontWeight:600 }}>{o.code}</span>
              <Pill tone={st.tone}>{st.label}</Pill>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:44, height:44, borderRadius:10, background:`linear-gradient(135deg,${D.navy},${D.navy700})`, display:'grid', placeItems:'center', flexShrink:0 }}><Icon name="utensils" size={20} color="#fff" /></div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:15, color:D.fg1, fontFamily:D.display }}>{o.item.name}{o.extra>0?` +${o.extra} more`:''}</div>
                <div style={{ fontSize:12, color:D.fg3 }}>{o.meal} · {o.time}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:D.display, fontWeight:800, fontSize:15, color:D.fg1 }}>{o.total.toLocaleString('fr-FR')} F</div>
                <div style={{ fontSize:11, color:D.fg3 }}>{o.method}</div>
              </div>
            </div>
          </button>
        );})}
      </div>
    </div>
  );
}

Object.assign(window, { StudentApp, ME });


/* ===== StudentFlows.jsx ===== */
/* ============================================================
   DAUST Dining — Student overlays: pass, checkout, success, detail
   ============================================================ */

function Sheet({ children, onClose, title, dark }){
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:20, background:'rgba(12,21,34,.5)', backdropFilter:'blur(4px)', display:'flex', flexDirection:'column', justifyContent:'flex-end', animation:'fadeIn .16s ease' }}>
      <div onClick={e=>e.stopPropagation()} style={{ background: dark?D.navy:'#fff', borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'92%', display:'flex', flexDirection:'column', animation:'sheetUp .3s cubic-bezier(.2,.7,.3,1)', boxShadow:'0 -12px 40px rgba(0,0,0,.3)' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 8px' }}>
          <div style={{ fontFamily:D.display, fontWeight:700, fontSize:18, color: dark?'#fff':D.fg1 }}>{title}</div>
          <button onClick={onClose} style={{ border:'none', background: dark?'rgba(255,255,255,.12)':D.subtle, color:dark?'#fff':D.fg2, width:32, height:32, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="x" size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Dining pass (QR) ---------- */
function PassOverlay({ onClose }){
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:25, background:`linear-gradient(160deg,${D.navy},${D.navyDeep})`, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:24, animation:'fadeIn .2s ease' }}>
      <button onClick={onClose} style={{ position:'absolute', top:48, right:18, border:'none', background:'rgba(255,255,255,.14)', color:'#fff', width:36, height:36, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="x" size={18} /></button>
      <img src="assets/logo-daust-white.png" alt="DAUST" style={{ height:26, marginBottom:26, opacity:.95 }} />
      <div style={{ background:'#fff', borderRadius:24, padding:'26px 26px 22px', display:'flex', flexDirection:'column', alignItems:'center', boxShadow:'0 24px 60px rgba(0,0,0,.4)', animation:'popIn .35s ease' }}>
        <QRCode value={`DAUST|${ME.id}|MEALPLAN|${ME.validUntil}`} size={224} />
        <div style={{ marginTop:18, textAlign:'center' }}>
          <div style={{ fontFamily:D.display, fontWeight:800, fontSize:20, color:D.fg1 }}>{ME.name}</div>
          <div className="mono" style={{ fontSize:13, color:D.fg2, marginTop:2 }}>{ME.id}</div>
        </div>
        <div style={{ marginTop:14, display:'flex', gap:8 }}>
          <Pill tone="success"><Dot color={D.success} size={6} /> {ME.plan} · Active</Pill>
        </div>
      </div>
      <div style={{ marginTop:22, color:'rgba(255,255,255,.7)', fontSize:13, display:'flex', alignItems:'center', gap:7 }}>
        <Icon name="scan-line" size={16} /> Present to dining staff at the entrance
      </div>
    </div>
  );
}

/* ---------- Checkout & payment ---------- */
function CheckoutFlow({ items, total, onClose, onPay, payStyle }){
  const [step, setStep] = React.useState('review'); // review | method | phone | processing
  const [method, setMethod] = React.useState(null);
  const [phone, setPhone] = React.useState('77 488 25 15');
  const PROVIDERS = [
    { key:'Wave', color:'#1dc3ff', text:'#063', logo:'W', sub:'Pay with your Wave balance' },
    { key:'Orange Money', color:'#ff7900', text:'#fff', logo:'OM', sub:'Pay with Orange Money' },
  ];

  function pay(){
    setStep('processing');
    setTimeout(()=>{ onPay(method); }, 2200);
  }

  return (
    <Sheet onClose={step==='processing'?()=>{}:onClose} title={ step==='review'?'Your order' : step==='processing'?'Confirming payment' : 'Payment' }>
      <div className="scroll" style={{ padding:'4px 20px 24px', overflowY:'auto' }}>
        {step==='review' && <>
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginTop:8 }}>
            {items.map(({dish,q})=>(
              <div key={dish.id} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:30, height:30, borderRadius:8, background:D.subtle, display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:700, color:D.navy, fontSize:14 }}>{q}×</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:14.5, color:D.fg1 }}>{dish.name}</div>
                  <div style={{ fontSize:12, color:D.fg3 }}>{dish.fr}</div>
                </div>
                <div style={{ fontFamily:D.display, fontWeight:700, color:D.fg1 }}>{(dish.price*q).toLocaleString('fr-FR')} F</div>
              </div>
            ))}
          </div>
          <div style={{ borderTop:`1px solid ${D.border}`, margin:'16px 0', paddingTop:14, display:'flex', flexDirection:'column', gap:8 }}>
            <Row label="Subtotal" value={fcfa(total)} />
            <Row label="Service" value="Included" muted />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
              <span style={{ fontFamily:D.display, fontWeight:700, fontSize:17 }}>Total</span>
              <span style={{ fontFamily:D.display, fontWeight:800, fontSize:22, color:D.navy }}>{fcfa(total)}</span>
            </div>
          </div>
          <div style={{ background:D.subtle, borderRadius:12, padding:'12px 14px', display:'flex', gap:10, alignItems:'flex-start', marginBottom:18 }}>
            <Icon name="info" size={16} color={D.navy} /><div style={{ fontSize:12.5, color:D.fg2, lineHeight:1.5 }}>Pickup at the dining hall on <strong>{WEEKEND_MENU.date}</strong>. Show your order QR to collect.</div>
          </div>
          <button onClick={()=>setStep('method')} className="btn btn-orange" style={{ width:'100%', padding:'14px' }}>Continue to payment <Icon name="arrow-right" size={17} /></button>
        </>}

        {step==='method' && <>
          <div style={{ fontSize:13, color:D.fg2, margin:'6px 0 14px' }}>Choose how you’d like to pay</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {PROVIDERS.map(p=>(
              <button key={p.key} onClick={()=>{ setMethod(p.key); setStep('phone'); }} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, border:`1.5px solid ${D.border}`, background:'#fff', cursor:'pointer', textAlign:'left', transition:'.14s' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=p.color} onMouseLeave={e=>e.currentTarget.style.borderColor=D.border}>
                <div style={{ width:46, height:46, borderRadius:12, background:p.color, color:p.text, display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:p.logo.length>1?15:20, flexShrink:0 }}>{p.logo}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:15.5, color:D.fg1 }}>{p.key}</div>
                  <div style={{ fontSize:12, color:D.fg3 }}>{p.sub}</div>
                </div>
                <Icon name="chevron-right" size={18} color={D.g400} />
              </button>
            ))}
          </div>
        </>}

        {step==='phone' && <>
          {(()=>{ const p=PROVIDERS.find(x=>x.key===method); return (
            <div style={{ display:'flex', alignItems:'center', gap:12, background:D.subtle, borderRadius:12, padding:'12px 14px', marginTop:6, marginBottom:18 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:p.color, color:p.text, display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:p.logo.length>1?13:18 }}>{p.logo}</div>
              <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:14.5 }}>{method}</div><div style={{ fontSize:12, color:D.fg3 }}>{fcfa(total)} to DAUST Dining</div></div>
              <button onClick={()=>setStep('method')} style={{ border:'none', background:'transparent', color:D.navy, fontWeight:600, fontSize:12.5, cursor:'pointer' }}>Change</button>
            </div>
          );})()}
          <label style={{ fontSize:12, fontWeight:600, letterSpacing:'.04em', color:D.fg2, display:'block', marginBottom:7 }}>MOBILE MONEY NUMBER</label>
          <div style={{ display:'flex', alignItems:'center', gap:10, border:`1.5px solid ${D.border}`, borderRadius:10, padding:'12px 14px', marginBottom:18 }}>
            <span style={{ fontWeight:700, color:D.fg2 }}>🇸🇳 +221</span>
            <input value={phone} onChange={e=>setPhone(e.target.value)} style={{ border:'none', outline:'none', fontSize:16, fontFamily:D.mono, flex:1, color:D.fg1 }} />
          </div>
          <button onClick={pay} className="btn btn-orange" style={{ width:'100%', padding:'14px' }}><Icon name="lock" size={16} /> Pay {fcfa(total)}</button>
          <div style={{ textAlign:'center', fontSize:11.5, color:D.fg3, marginTop:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Icon name="shield" size={13} /> You’ll get a prompt on your phone to approve</div>
        </>}

        {step==='processing' && (
          <div style={{ padding:'30px 0 26px', display:'flex', flexDirection:'column', alignItems:'center', gap:18 }}>
            <div style={{ position:'relative', width:74, height:74 }}>
              <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:`4px solid ${D.g100}`, borderTopColor:D.orange, animation:'spin 0.9s linear infinite' }} />
              <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center' }}><Icon name="smartphone" size={28} color={D.navy} /></div>
            </div>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontFamily:D.display, fontWeight:700, fontSize:17, color:D.fg1 }}>Approve on your phone</div>
              <div style={{ fontSize:13, color:D.fg3, marginTop:4 }}>Confirming {fcfa(total)} via {method}…</div>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function Row({ label, value, muted }){
  return <div style={{ display:'flex', justifyContent:'space-between', fontSize:13.5 }}><span style={{ color:D.fg3 }}>{label}</span><span style={{ color: muted?D.fg3:D.fg1, fontWeight:600 }}>{value}</span></div>;
}

/* ---------- Meal-plan manager & renewal ---------- */
function PlanManager({ onClose }){
  const [step, setStep] = React.useState('home'); // home | choose | method | phone | processing | done
  const [tier, setTier] = React.useState(ME.plan);
  const [method, setMethod] = React.useState(null);
  const price = PLAN_PRICES[tier];
  const history = [
    { label:`Annual plan · 2025–26`, amount:360000, method:'Bank transfer', when:'2 Sep 2025', status:'paid' },
    { label:`Top-up · weekend credit`, amount:6500, method:'Wave', when:'18 May 2026', status:'paid' },
  ];
  const PROVIDERS = [
    { key:'Wave', color:'#1dc3ff', logo:'W' },
    { key:'Orange Money', color:'#ff7900', logo:'OM' },
  ];
  function pay(){ setStep('processing'); setTimeout(()=>setStep('done'), 2200); }

  const title = step==='home'?'My meal plan' : step==='choose'?'Choose a plan' : step==='processing'?'Confirming payment' : step==='done'?'Plan renewed' : 'Payment';

  return (
    <Sheet onClose={step==='processing'?()=>{}:onClose} title={title}>
      <div className="scroll" style={{ padding:'4px 20px 26px', overflowY:'auto' }}>
        {step==='home' && <>
          <div style={{ background:`linear-gradient(135deg,${D.navy},${D.navyDeep})`, borderRadius:16, padding:'18px', color:'#fff', marginTop:6 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div className="eyebrow" style={{ color:D.orange }}>Current plan</div>
              <Pill tone="success"><Dot color={D.success} size={6} /> Active</Pill>
            </div>
            <div style={{ fontFamily:D.display, fontWeight:800, fontSize:24, marginTop:8 }}>{ME.plan} Plan</div>
            <div style={{ fontSize:12.5, color:D.onNavyMuted, marginTop:2 }}>Valid until {ME.validUntil}</div>
            <div style={{ marginTop:14, height:7, borderRadius:999, background:'rgba(255,255,255,.16)', overflow:'hidden' }}><div style={{ width:'68%', height:'100%', background:D.orange, borderRadius:999 }} /></div>
            <div style={{ fontSize:11.5, color:D.onNavyMuted, marginTop:7 }}>68% of the term used · 94 days remaining</div>
          </div>
          <div className="eyebrow" style={{ margin:'20px 0 10px', color:D.fg3 }}>Payment history</div>
          <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
            {history.map((h,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', border:`1px solid ${D.border}`, borderRadius:12 }}>
                <div style={{ width:36, height:36, borderRadius:9, background:D.successBg, color:D.success, display:'grid', placeItems:'center' }}><Icon name="check" size={17} strokeWidth={2.6} /></div>
                <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:13.5, color:D.fg1 }}>{h.label}</div><div style={{ fontSize:11.5, color:D.fg3 }}>{h.when} · {h.method}</div></div>
                <div style={{ fontFamily:D.display, fontWeight:700, fontSize:14, color:D.fg1 }}>{h.amount.toLocaleString('fr-FR')} F</div>
              </div>
            ))}
          </div>
          <button onClick={()=>setStep('choose')} className="btn btn-orange" style={{ width:'100%', padding:'14px', marginTop:20 }}><Icon name="refresh-cw" size={16} /> Renew or change plan</button>
        </>}

        {step==='choose' && <>
          <div style={{ fontSize:13, color:D.fg2, margin:'6px 0 14px' }}>Pay for next term — meals every day, Monday to Friday.</div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {Object.entries(PLAN_PRICES).map(([p,pr])=>(
              <button key={p} onClick={()=>setTier(p)} style={{ textAlign:'left', cursor:'pointer', borderRadius:14, padding:'16px', border:`2px solid ${tier===p?D.navy:D.border}`, background: tier===p?'#f3f7fc':'#fff', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:22, height:22, borderRadius:'50%', border:`2px solid ${tier===p?D.navy:D.g300}`, display:'grid', placeItems:'center', flexShrink:0 }}>{tier===p && <span style={{ width:11, height:11, borderRadius:'50%', background:D.navy }} />}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:D.display, fontWeight:700, fontSize:16.5, color:D.fg1 }}>{p} Plan</div>
                  <div style={{ fontSize:12, color:D.fg3 }}>{p==='Annual'?'September – August':'One semester'}</div>
                </div>
                <div style={{ fontFamily:D.display, fontWeight:800, fontSize:17, color:D.navy }}>{pr.toLocaleString('fr-FR')} <span style={{ fontSize:11, color:D.fg3 }}>F</span></div>
              </button>
            ))}
          </div>
          <button onClick={()=>setStep('method')} className="btn btn-orange" style={{ width:'100%', padding:'14px', marginTop:18 }}>Continue · {price.toLocaleString('fr-FR')} F <Icon name="arrow-right" size={16} /></button>
        </>}

        {step==='method' && <>
          <div style={{ fontSize:13, color:D.fg2, margin:'6px 0 14px' }}>{tier} plan · <strong>{fcfa(price)}</strong></div>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {PROVIDERS.map(p=>(
              <button key={p.key} onClick={()=>{ setMethod(p.key); setStep('phone'); }} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', borderRadius:14, border:`1.5px solid ${D.border}`, background:'#fff', cursor:'pointer', textAlign:'left' }}>
                <div style={{ width:46, height:46, borderRadius:12, background:p.color, color:'#fff', display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:p.logo.length>1?15:20 }}>{p.logo}</div>
                <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:15.5, color:D.fg1 }}>{p.key}</div><div style={{ fontSize:12, color:D.fg3 }}>Pay {fcfa(price)}</div></div>
                <Icon name="chevron-right" size={18} color={D.g400} />
              </button>
            ))}
            <div style={{ display:'flex', alignItems:'center', gap:10, fontSize:12.5, color:D.fg3, justifyContent:'center', marginTop:4 }}><Icon name="building-2" size={15} /> Bank transfer also available at the bursar's office</div>
          </div>
        </>}

        {step==='phone' && (()=>{ const p=PROVIDERS.find(x=>x.key===method); return <>
          <div style={{ display:'flex', alignItems:'center', gap:12, background:D.subtle, borderRadius:12, padding:'12px 14px', marginTop:6, marginBottom:18 }}>
            <div style={{ width:40, height:40, borderRadius:10, background:p.color, color:'#fff', display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:p.logo.length>1?13:18 }}>{p.logo}</div>
            <div style={{ flex:1 }}><div style={{ fontWeight:700, fontSize:14.5 }}>{method}</div><div style={{ fontSize:12, color:D.fg3 }}>{fcfa(price)} · {tier} plan</div></div>
            <button onClick={()=>setStep('method')} style={{ border:'none', background:'transparent', color:D.navy, fontWeight:600, fontSize:12.5, cursor:'pointer' }}>Change</button>
          </div>
          <label style={{ fontSize:12, fontWeight:600, letterSpacing:'.04em', color:D.fg2, display:'block', marginBottom:7 }}>MOBILE MONEY NUMBER</label>
          <div style={{ display:'flex', alignItems:'center', gap:10, border:`1.5px solid ${D.border}`, borderRadius:10, padding:'12px 14px', marginBottom:18 }}>
            <span style={{ fontWeight:700, color:D.fg2 }}>🇸🇳 +221</span>
            <input defaultValue="77 488 25 15" style={{ border:'none', outline:'none', fontSize:16, fontFamily:D.mono, flex:1, color:D.fg1 }} />
          </div>
          <button onClick={pay} className="btn btn-orange" style={{ width:'100%', padding:'14px' }}><Icon name="lock" size={16} /> Pay {fcfa(price)}</button>
        </>; })()}

        {step==='processing' && (
          <div style={{ padding:'30px 0 26px', display:'flex', flexDirection:'column', alignItems:'center', gap:18 }}>
            <div style={{ position:'relative', width:74, height:74 }}>
              <div style={{ position:'absolute', inset:0, borderRadius:'50%', border:`4px solid ${D.g100}`, borderTopColor:D.orange, animation:'spin 0.9s linear infinite' }} />
              <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center' }}><Icon name="smartphone" size={28} color={D.navy} /></div>
            </div>
            <div style={{ textAlign:'center' }}><div style={{ fontFamily:D.display, fontWeight:700, fontSize:17 }}>Approve on your phone</div><div style={{ fontSize:13, color:D.fg3, marginTop:4 }}>Confirming {fcfa(price)} via {method}…</div></div>
          </div>
        )}

        {step==='done' && (
          <div style={{ padding:'18px 0 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
            <div style={{ width:78, height:78, borderRadius:'50%', background:D.successBg, display:'grid', placeItems:'center', animation:'popIn .4s ease' }}>
              <svg width="40" height="40" viewBox="0 0 52 52"><path d="M14 27 l8 8 l16 -18" fill="none" stroke={D.success} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray:60, strokeDashoffset:60, animation:'drawCheck .4s .12s ease forwards' }} /></svg>
            </div>
            <div style={{ textAlign:'center' }}><div style={{ fontFamily:D.display, fontWeight:800, fontSize:21, color:D.fg1 }}>{tier} plan active</div><div style={{ fontSize:13, color:D.fg3, marginTop:5 }}>{fcfa(price)} paid via {method}. Your dining pass is ready.</div></div>
            <button onClick={onClose} className="btn btn-navy" style={{ width:'100%', padding:'14px', marginTop:6 }}>Done</button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Success ---------- */
function OrderSuccess({ order, onClose }){
  return (
    <div style={{ position:'absolute', inset:0, zIndex:26, background:'#fff', display:'flex', flexDirection:'column', animation:'fadeIn .2s ease' }}>
      <div style={{ background:`linear-gradient(160deg,${D.success},#1f5e3c)`, padding:'56px 24px 30px', color:'#fff', textAlign:'center', position:'relative' }}>
        <div style={{ width:78, height:78, margin:'0 auto 14px', borderRadius:'50%', background:'rgba(255,255,255,.18)', display:'grid', placeItems:'center', animation:'popIn .4s ease' }}>
          <svg width="40" height="40" viewBox="0 0 52 52"><path d="M14 27 l8 8 l16 -18" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" style={{ strokeDasharray:60, strokeDashoffset:60, animation:'drawCheck .4s .15s ease forwards' }} /></svg>
        </div>
        <div style={{ fontFamily:D.display, fontWeight:800, fontSize:24 }}>Payment confirmed</div>
        <div style={{ fontSize:13.5, color:'rgba(255,255,255,.85)', marginTop:5 }}>{fcfa(order.total)} paid via {order.method}</div>
      </div>
      <div className="scroll" style={{ flex:1, padding:'24px 24px 20px', display:'flex', flexDirection:'column', alignItems:'center' }}>
        <div style={{ fontSize:12.5, color:D.fg3, marginBottom:4, letterSpacing:'.04em' }}>SHOW THIS AT PICKUP</div>
        <div style={{ background:'#fff', border:`1px solid ${D.border}`, borderRadius:18, padding:18, boxShadow:'var(--shadow-md)' }}>
          <QRCode value={`DAUST|ORDER|${order.code}`} size={170} logo={false} />
        </div>
        <div className="mono" style={{ fontFamily:D.display, fontWeight:800, fontSize:22, letterSpacing:'.08em', color:D.navy, marginTop:14 }}>{order.code}</div>
        <div style={{ width:'100%', background:D.subtle, borderRadius:14, padding:'14px 16px', marginTop:18, display:'flex', flexDirection:'column', gap:9 }}>
          <Row label="Meal" value={`${order.item.name}${order.extra>0?` +${order.extra}`:''}`} />
          <Row label="Service" value={`${order.meal} · ${WEEKEND_MENU.date.split(',')[0]}`} />
          <Row label="Pickup" value="DAUST Dining Hall" />
        </div>
      </div>
      <div style={{ padding:'12px 24px 26px' }}>
        <button onClick={onClose} className="btn btn-navy" style={{ width:'100%', padding:'14px' }}>View my orders</button>
      </div>
    </div>
  );
}

/* ---------- Order detail w/ status tracker ---------- */
function OrderDetail({ order, onClose }){
  const steps = ['paid','preparing','ready','collected'];
  const labels = { paid:'Payment confirmed', preparing:'Kitchen preparing', ready:'Ready for pickup', collected:'Collected' };
  const curIdx = steps.indexOf(order.status);
  return (
    <Sheet onClose={onClose} title={order.code}>
      <div className="scroll" style={{ padding:'4px 20px 26px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:18 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:`linear-gradient(135deg,${D.navy},${D.navy700})`, display:'grid', placeItems:'center' }}><Icon name="utensils" size={22} color="#fff" /></div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:17 }}>{order.item.name}{order.extra>0?` +${order.extra} more`:''}</div>
            <div style={{ fontSize:12.5, color:D.fg3 }}>{order.meal} · {fcfa(order.total)} · {order.method}</div>
          </div>
        </div>
        {order.status!=='collected' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', background:D.subtle, borderRadius:16, padding:'18px', marginBottom:20 }}>
            <QRCode value={`DAUST|ORDER|${order.code}`} size={140} logo={false} />
            <div style={{ fontSize:12, color:D.fg3, marginTop:10 }}>Show at pickup counter</div>
          </div>
        )}
        <div style={{ position:'relative', paddingLeft:8 }}>
          {steps.map((s,i)=>{ const done=i<=curIdx; const active=i===curIdx;
            return (
            <div key={s} style={{ display:'flex', gap:14, paddingBottom: i<steps.length-1?20:0, position:'relative' }}>
              {i<steps.length-1 && <div style={{ position:'absolute', left:11, top:24, bottom:0, width:2, background: i<curIdx?D.success:D.border }} />}
              <div style={{ width:24, height:24, borderRadius:'50%', flexShrink:0, display:'grid', placeItems:'center', zIndex:1,
                background: done?D.success:'#fff', border:`2px solid ${done?D.success:D.border}`, color:'#fff' }}>
                {done ? <Icon name="check" size={13} strokeWidth={3} /> : <span style={{ width:7, height:7, borderRadius:'50%', background:D.g300 }} />}
              </div>
              <div style={{ paddingTop:1 }}>
                <div style={{ fontWeight:600, fontSize:14.5, color: done?D.fg1:D.fg3 }}>{labels[s]}</div>
                {active && <div style={{ fontSize:12, color:D.orange, fontWeight:600, marginTop:2 }}>Current status</div>}
              </div>
            </div>
          );})}
        </div>
      </div>
    </Sheet>
  );
}

Object.assign(window, { Sheet, PassOverlay, CheckoutFlow, OrderSuccess, OrderDetail, PlanManager });


/* ===== Admin.jsx ===== */
/* ============================================================
   DAUST Dining — Admin backend (desktop). Shell + Overview + Live.
   ============================================================ */

const ATTEND = [
  { d:'Mon', breakfast:312, lunch:381, dinner:298 },
  { d:'Tue', breakfast:298, lunch:372, dinner:305 },
  { d:'Wed', breakfast:321, lunch:388, dinner:289 },
  { d:'Thu', breakfast:305, lunch:369, dinner:312 },
  { d:'Fri', breakfast:288, lunch:355, dinner:251 },
];
const NAV = [
  { key:'overview', label:'Overview', icon:'layout-dashboard' },
  { key:'live', label:'Live Service', icon:'radio' },
  { key:'students', label:'Students', icon:'users' },
  { key:'orders', label:'Weekend Orders', icon:'shopping-bag' },
  { key:'menus', label:'Menus', icon:'book-open' },
  { key:'finance', label:'Finances', icon:'wallet' },
  { key:'reports', label:'Reports', icon:'bar-chart-3' },
  { key:'settings', label:'Settings', icon:'settings' },
];

function AdminApp({ onExit }){
  const [view, setView] = React.useState('overview');
  const [drawer, setDrawer] = React.useState(null); // student
  const cur = NAV.find(n=>n.key===view);
  return (
    <div style={{ width:'100%', height:'100%', display:'flex', background:D.subtle, fontFamily:D.body, overflow:'hidden' }}>
      {/* sidebar */}
      <div style={{ width:236, flexShrink:0, background:D.navy, display:'flex', flexDirection:'column', padding:'20px 14px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 8px 18px' }}>
          <img src="assets/logo-daust-white.png" alt="DAUST" style={{ height:26 }} />
        </div>
        <div style={{ padding:'0 8px 14px', marginBottom:8, borderBottom:'1px solid rgba(255,255,255,.1)' }}>
          <div style={{ fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:D.onNavyMuted, fontWeight:600 }}>Dining Admin</div>
        </div>
        <nav style={{ display:'flex', flexDirection:'column', gap:3, flex:1 }}>
          {NAV.map(n=>(
            <button key={n.key} onClick={()=>setView(n.key)} style={{ display:'flex', alignItems:'center', gap:11, padding:'10px 12px', borderRadius:10, border:'none', cursor:'pointer', textAlign:'left',
              background: view===n.key?'rgba(255,255,255,.12)':'transparent', color: view===n.key?'#fff':D.onNavyMuted, fontFamily:D.body, fontWeight:600, fontSize:13.5, transition:'.14s' }}
              onMouseEnter={e=>{ if(view!==n.key) e.currentTarget.style.color='#fff'; }} onMouseLeave={e=>{ if(view!==n.key) e.currentTarget.style.color=D.onNavyMuted; }}>
              <Icon name={n.icon} size={18} /> {n.label}
              {n.key==='orders' && <span style={{ marginLeft:'auto', background:D.orange, color:'#fff', fontSize:10.5, fontWeight:700, borderRadius:999, padding:'1px 7px' }}>{ORDERS.filter(o=>o.status==='pending').length}</span>}
            </button>
          ))}
        </nav>
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 8px', borderTop:'1px solid rgba(255,255,255,.1)', marginTop:8 }}>
          <Avatar name="Khadija Mbaye" size={34} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ color:'#fff', fontSize:13, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>K. Mbaye</div>
            <div style={{ color:D.onNavyMuted, fontSize:11 }}>Dining Manager</div>
          </div>
          <button onClick={onExit} title="Exit" style={{ border:'none', background:'rgba(255,255,255,.1)', color:'#fff', width:30, height:30, borderRadius:8, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="log-out" size={15} /></button>
        </div>
      </div>

      {/* main */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:0 }}>
        {/* topbar */}
        <div style={{ height:64, background:'#fff', borderBottom:`1px solid ${D.border}`, display:'flex', alignItems:'center', padding:'0 28px', gap:18, flexShrink:0 }}>
          <div>
            <div style={{ fontFamily:D.display, fontWeight:700, fontSize:20, color:D.fg1 }}>{cur.label}</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, background:D.subtle, borderRadius:999, padding:'8px 14px', color:D.fg3, fontSize:13 }}>
              <Icon name="calendar" size={15} /> Monday, 29 May 2026
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:7, background:D.successBg, color:D.success, borderRadius:999, padding:'8px 13px', fontSize:12.5, fontWeight:600 }}>
              <Dot color={D.success} size={7} pulse /> Lunch service live
            </div>
          </div>
        </div>

        {/* view */}
        <div className="scroll" style={{ flex:1, minHeight:0, padding:'24px 28px 40px' }}>
          {view==='overview' && <AdminOverview onView={setView} />}
          {view==='live' && <AdminLive />}
          {view==='students' && <AdminStudents onOpen={setDrawer} />}
          {view==='orders' && <AdminOrders />}
          {view==='menus' && <AdminMenus />}
          {view==='finance' && <AdminFinance />}
          {view==='reports' && <AdminReports />}
          {view==='settings' && <AdminSettings />}
        </div>
      </div>

      {drawer && <StudentDrawer student={drawer} onClose={()=>setDrawer(null)} />}
    </div>
  );
}

/* ---------- shared admin bits ---------- */
function Card({ children, style, pad=20 }){
  return <div style={{ background:'#fff', border:`1px solid ${D.border}`, borderRadius:14, padding:pad, boxShadow:'var(--shadow-sm)', ...style }}>{children}</div>;
}
function StatCard({ label, value, sub, icon, tone='navy', delta }){
  const tones = { navy:D.navy, orange:D.orange, success:D.success, danger:D.danger };
  return (
    <Card style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div style={{ width:40, height:40, borderRadius:10, background: tones[tone]+'14', color:tones[tone], display:'grid', placeItems:'center' }}><Icon name={icon} size={20} /></div>
        {delta && <span style={{ fontSize:12, fontWeight:700, color: delta>0?D.success:D.danger, display:'flex', alignItems:'center', gap:2 }}><Icon name={delta>0?'trending-up':'trending-down'} size={14} /> {Math.abs(delta)}%</span>}
      </div>
      <div>
        <div style={{ fontFamily:D.display, fontWeight:800, fontSize:32, color:D.fg1, lineHeight:1 }}>{value}</div>
        <div style={{ fontSize:13, color:D.fg2, fontWeight:600, marginTop:5 }}>{label}</div>
        {sub && <div style={{ fontSize:12, color:D.fg3, marginTop:2 }}>{sub}</div>}
      </div>
    </Card>
  );
}
function SectionTitle({ children, action }){
  return <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
    <div style={{ fontFamily:D.display, fontWeight:700, fontSize:17, color:D.fg1 }}>{children}</div>{action}
  </div>;
}

/* grouped bar chart */
function BarChart({ data, keys, colors, h=200 }){
  const max = Math.max(...data.flatMap(d=>keys.map(k=>d[k])))*1.1;
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:18, height:h, padding:'0 4px' }}>
        {data.map(d=>(
          <div key={d.d} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8, height:'100%' }}>
            <div style={{ flex:1, display:'flex', alignItems:'flex-end', gap:5, width:'100%', justifyContent:'center' }}>
              {keys.map((k,i)=>(
                <div key={k} title={`${k}: ${d[k]}`} style={{ width:`${70/keys.length}%`, maxWidth:22, height:`${d[k]/max*100}%`, background:colors[i], borderRadius:'5px 5px 0 0', transition:'height .5s ease' }} />
              ))}
            </div>
            <div style={{ fontSize:12, color:D.fg3, fontWeight:600 }}>{d.d}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:18, marginTop:14, justifyContent:'center' }}>
        {keys.map((k,i)=>(<div key={k} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:D.fg2, textTransform:'capitalize' }}><span style={{ width:11, height:11, borderRadius:3, background:colors[i] }} />{k}</div>))}
      </div>
    </div>
  );
}

/* donut */
function Donut({ segments, size=150, label, center }){
  const total = segments.reduce((s,x)=>s+x.value,0);
  let acc = 0; const r=size/2-14, c=2*Math.PI*r;
  return (
    <div style={{ position:'relative', width:size, height:size }}>
      <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={D.g100} strokeWidth={14} />
        {segments.map((s,i)=>{ const len=s.value/total*c; const off=acc; acc+=len; return (
          <circle key={i} cx={size/2} cy={size/2} r={r} fill="none" stroke={s.color} strokeWidth={14} strokeDasharray={`${len} ${c-len}`} strokeDashoffset={-off} strokeLinecap="round" />
        );})}
      </svg>
      <div style={{ position:'absolute', inset:0, display:'grid', placeItems:'center', textAlign:'center' }}>
        <div><div style={{ fontFamily:D.display, fontWeight:800, fontSize:center!=null?28:26, color:D.fg1, lineHeight:1 }}>{center!=null?center:total}</div><div style={{ fontSize:11, color:D.fg3 }}>{label}</div></div>
      </div>
    </div>
  );
}

/* ---------- Overview ---------- */
function AdminOverview({ onView }){
  const activeCount = STUDENTS.filter(s=>s.status==='active').length;
  const unpaid = STUDENTS.filter(s=>s.status!=='active').length;
  const wkRevenue = ORDERS.filter(o=>o.status!=='pending').reduce((s,o)=>s+o.total,0);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:22 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        <StatCard label="Meals served today" value="936" sub="across 3 services" icon="utensils" tone="navy" delta={4} />
        <StatCard label="Active meal plans" value={activeCount} sub={`of ${STUDENTS.length} students`} icon="badge-check" tone="success" delta={2} />
        <StatCard label="Unpaid / expired" value={unpaid} sub="need follow-up" icon="alert-triangle" tone="danger" delta={-6} />
        <StatCard label="Weekend revenue" value={fcfa(wkRevenue).replace(' FCFA','')} sub="FCFA · this weekend" icon="wallet" tone="orange" delta={12} />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:16 }}>
        <Card>
          <SectionTitle action={<div style={{ display:'flex', gap:6 }}><Pill tone="outline">This week</Pill></div>}>Attendance by meal</SectionTitle>
          <BarChart data={ATTEND} keys={['breakfast','lunch','dinner']} colors={[D.navy700, D.orange, D.steel]} h={210} />
        </Card>
        <Card>
          <SectionTitle>Today’s split</SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:18 }}>
            <Donut label="served" segments={[{value:321,color:D.navy700},{value:388,color:D.orange},{value:227,color:D.steel}]} />
            <div style={{ display:'flex', flexDirection:'column', gap:12, flex:1 }}>
              {[['Breakfast',321,D.navy700],['Lunch',388,D.orange],['Dinner',227,D.steel]].map(([l,v,c])=>(
                <div key={l} style={{ display:'flex', alignItems:'center', gap:9 }}>
                  <span style={{ width:11, height:11, borderRadius:3, background:c }} />
                  <span style={{ fontSize:13, color:D.fg2, flex:1 }}>{l}</span>
                  <span style={{ fontFamily:D.display, fontWeight:700, color:D.fg1 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card>
          <SectionTitle action={<button onClick={()=>onView('live')} style={{ border:'none', background:'transparent', color:D.navy, fontWeight:600, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>Live view <Icon name="arrow-right" size={14} /></button>}>Recent scans</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {RECENT_SCANS.slice(0,5).map((f,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:11, padding:'8px 4px', borderBottom: i<4?`1px solid ${D.g100}`:'none' }}>
                <div style={{ width:26, height:26, borderRadius:'50%', display:'grid', placeItems:'center', background: f.ok?D.successBg:D.dangerBg, color: f.ok?D.success:D.danger, flexShrink:0 }}><Icon name={f.ok?'check':'x'} size={14} strokeWidth={2.6} /></div>
                <span style={{ fontSize:13.5, fontWeight:600, color:D.fg1, flex:1 }}>{f.name}</span>
                <span className="mono" style={{ fontSize:12, color:D.fg3 }}>{f.id}</span>
                <span className="mono" style={{ fontSize:12, color:D.fg3 }}>{f.t}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle action={<button onClick={()=>onView('orders')} style={{ border:'none', background:'transparent', color:D.navy, fontWeight:600, fontSize:13, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>Manage <Icon name="arrow-right" size={14} /></button>}>Weekend orders</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            {ORDERS.slice(0,5).map((o,i)=>{ const st=ORDER_STATUS[o.status]; return (
              <div key={o.code} style={{ display:'flex', alignItems:'center', gap:11, padding:'8px 4px', borderBottom: i<4?`1px solid ${D.g100}`:'none' }}>
                <span className="mono" style={{ fontSize:12, color:D.fg3, width:54 }}>{o.code}</span>
                <span style={{ fontSize:13.5, fontWeight:600, color:D.fg1, flex:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{o.student.name}</span>
                <Pill tone={st.tone}>{st.label}</Pill>
              </div>
            );})}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Live Service ---------- */
function AdminLive(){
  const [feed, setFeed] = React.useState(RECENT_SCANS);
  const [count, setCount] = React.useState(388);
  React.useEffect(()=>{
    const id = setInterval(()=>{
      const s = STUDENTS[Math.floor(Math.random()*STUDENTS.length)];
      const ok = Math.random()>0.12;
      const t = new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
      setFeed(f=>[{ name:s.name, id:s.id, ok, t, reason: ok?null:'Already served' }, ...f].slice(0,12));
      if (ok) setCount(c=>c+1);
    }, 2600);
    return ()=>clearInterval(id);
  },[]);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        <StatCard label="Lunch served (live)" value={count} sub="updating in real time" icon="utensils" tone="orange" />
        <StatCard label="Throughput" value="14/min" sub="last 5 minutes" icon="gauge" tone="navy" />
        <StatCard label="Turned away" value="9" sub="this service" icon="user-x" tone="danger" />
        <StatCard label="Capacity" value="78%" sub="of 500 seats" icon="armchair" tone="success" />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1.3fr', gap:16 }}>
        <Card>
          <SectionTitle>Stations</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[['Entrance A','Aliou S.',true],['Entrance B','Ndeye F.',true],['Staff gate','—',false]].map(([s,who,on])=>(
              <div key={s} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:12, background:D.subtle }}>
                <div style={{ width:38, height:38, borderRadius:10, background: on?D.successBg:D.g100, color: on?D.success:D.g400, display:'grid', placeItems:'center' }}><Icon name="scan-line" size={19} /></div>
                <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>{s}</div><div style={{ fontSize:12, color:D.fg3 }}>{on?`Staffed · ${who}`:'Offline'}</div></div>
                {on ? <Pill tone="success"><Dot color={D.success} size={6} pulse /> Live</Pill> : <Pill tone="neutral">Off</Pill>}
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle action={<Pill tone="success"><Dot color={D.success} size={6} pulse /> Live feed</Pill>}>Scan activity</SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:3, maxHeight:340, overflow:'hidden' }}>
            {feed.map((f,i)=>(
              <div key={f.id+f.t+i} style={{ display:'flex', alignItems:'center', gap:11, padding:'9px 4px', borderBottom:`1px solid ${D.g100}`, animation: i===0?'fadeUp .3s ease':'none' }}>
                <div style={{ width:26, height:26, borderRadius:'50%', display:'grid', placeItems:'center', background: f.ok?D.successBg:D.dangerBg, color: f.ok?D.success:D.danger, flexShrink:0 }}><Icon name={f.ok?'check':'x'} size={14} strokeWidth={2.6} /></div>
                <span style={{ fontSize:13.5, fontWeight:600, color:D.fg1, flex:1 }}>{f.name}</span>
                <span style={{ fontSize:12, color: f.ok?D.fg3:D.danger }}>{f.ok?f.id:f.reason}</span>
                <span className="mono" style={{ fontSize:12, color:D.fg3 }}>{f.t}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { AdminApp, Card, StatCard, SectionTitle, BarChart, Donut, ATTEND });


/* ===== AdminViews.jsx ===== */
/* ============================================================
   DAUST Dining — Admin views: Students, Orders, Menus, Reports
   ============================================================ */

const STATUS_META = {
  active:  { label:'Active',  tone:'success' },
  pending: { label:'Pending', tone:'warn' },
  expired: { label:'Expired', tone:'danger' },
};

/* ---------- Students directory ---------- */
function AdminStudents({ onOpen }){
  const [q, setQ] = React.useState('');
  const [filter, setFilter] = React.useState('all');
  const filtered = STUDENTS.filter(s=>{
    if (filter!=='all' && s.status!==filter) return false;
    if (q && !(`${s.name} ${s.id}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }).slice(0,60);
  const counts = { all:STUDENTS.length, active:STUDENTS.filter(s=>s.status==='active').length, pending:STUDENTS.filter(s=>s.status==='pending').length, expired:STUDENTS.filter(s=>s.status==='expired').length };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <div style={{ display:'flex', alignItems:'center', gap:9, background:'#fff', border:`1.5px solid ${D.border}`, borderRadius:10, padding:'10px 14px', width:300 }}>
          <Icon name="search" size={17} color={D.g400} />
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search name or ID…" style={{ border:'none', outline:'none', fontSize:14, fontFamily:D.body, flex:1, color:D.fg1, background:'transparent' }} />
        </div>
        <div style={{ display:'flex', gap:6, background:D.g100, padding:4, borderRadius:999 }}>
          {['all','active','pending','expired'].map(f=>(
            <button key={f} onClick={()=>setFilter(f)} style={{ border:'none', cursor:'pointer', borderRadius:999, padding:'7px 15px', fontFamily:D.body, fontWeight:600, fontSize:12.5, textTransform:'capitalize',
              background: filter===f?'#fff':'transparent', color: filter===f?D.navy:D.fg2, boxShadow: filter===f?'var(--shadow-sm)':'none' }}>{f} <span style={{ color:D.g400 }}>{counts[f]}</span></button>
          ))}
        </div>
        <button className="btn btn-outline" style={{ marginLeft:'auto', padding:'10px 18px' }}><Icon name="download" size={16} /> Export CSV</button>
      </div>

      <Card pad={0}>
        <div style={{ display:'grid', gridTemplateColumns:'2.4fr 1.4fr 1fr 1.2fr 1fr', padding:'13px 20px', borderBottom:`1px solid ${D.border}`, fontSize:11.5, letterSpacing:'.06em', textTransform:'uppercase', color:D.fg3, fontWeight:700 }}>
          <div>Student</div><div>Program</div><div>Plan</div><div>Meals today</div><div>Status</div>
        </div>
        <div className="scroll" style={{ maxHeight:520, overflowY:'auto' }}>
          {filtered.map((s,i)=>{ const m=STATUS_META[s.status];
            return (
            <div key={s.id} onClick={()=>onOpen(s)} style={{ display:'grid', gridTemplateColumns:'2.4fr 1.4fr 1fr 1.2fr 1fr', alignItems:'center', padding:'12px 20px', borderBottom: i<filtered.length-1?`1px solid ${D.g100}`:'none', cursor:'pointer', transition:'.1s' }}
              onMouseEnter={e=>e.currentTarget.style.background=D.subtle} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <Avatar name={s.name} size={36} />
                <div><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>{s.name}</div><div className="mono" style={{ fontSize:12, color:D.fg3 }}>{s.id}</div></div>
              </div>
              <div style={{ fontSize:13, color:D.fg2 }}>{s.program}</div>
              <div style={{ fontSize:13, color:D.fg2 }}>{s.plan}</div>
              <div style={{ display:'flex', gap:5 }}>
                {MEALS.map(meal=>{ const done=s.mealsToday[meal.key]; return (
                  <span key={meal.key} title={meal.label} style={{ width:26, height:26, borderRadius:7, display:'grid', placeItems:'center', background: done?D.successBg:D.g100, color: done?D.success:D.g400 }}><Icon name={meal.icon} size={13} /></span>
                );})}
              </div>
              <div><Pill tone={m.tone}>{m.label}</Pill></div>
            </div>
          );})}
        </div>
      </Card>
    </div>
  );
}

/* ---------- Student detail drawer ---------- */
function StudentDrawer({ student, onClose }){
  const s = student; const m = STATUS_META[s.status];
  const history = [
    { d:'Today', meals:[['breakfast',s.mealsToday.breakfast,'07:38'],['lunch',s.mealsToday.lunch,'12:51'],['dinner',false,'—']] },
    { d:'Fri 26 May', meals:[['breakfast',true,'07:44'],['lunch',true,'13:02'],['dinner',true,'19:22']] },
    { d:'Thu 25 May', meals:[['breakfast',false,'—'],['lunch',true,'12:40'],['dinner',true,'19:51']] },
  ];
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:40, background:'rgba(12,21,34,.45)', display:'flex', justifyContent:'flex-end', animation:'fadeIn .15s ease' }}>
      <div onClick={e=>e.stopPropagation()} className="scroll" style={{ width:420, background:'#fff', height:'100%', overflowY:'auto', animation:'drawerIn .26s cubic-bezier(.2,.7,.3,1)' }}>
        <div style={{ background:`linear-gradient(160deg,${D.navy},${D.navyDeep})`, padding:'24px 26px 26px', color:'#fff', position:'relative' }}>
          <button onClick={onClose} style={{ position:'absolute', top:18, right:18, border:'none', background:'rgba(255,255,255,.14)', color:'#fff', width:32, height:32, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center' }}><Icon name="x" size={17} /></button>
          <Avatar name={s.name} size={64} ring="rgba(255,255,255,.25)" />
          <div style={{ fontFamily:D.display, fontWeight:800, fontSize:23, marginTop:14 }}>{s.name}</div>
          <div className="mono" style={{ fontSize:13, color:D.onNavyMuted, marginTop:3 }}>{s.id}</div>
          <div style={{ display:'flex', gap:8, marginTop:14 }}>
            <Pill tone={m.tone}>{m.label}</Pill>
            <Pill tone="navy" style={{ background:'rgba(255,255,255,.14)' }}>{s.plan} plan</Pill>
          </div>
        </div>
        <div style={{ padding:'22px 26px 30px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:22 }}>
            {[['Program',s.program],['Year',s.year],['Valid until',s.validUntil],['Residence',s.room]].map(([k,v])=>(
              <div key={k} style={{ background:D.subtle, borderRadius:10, padding:'11px 13px' }}>
                <div style={{ fontSize:11, letterSpacing:'.05em', textTransform:'uppercase', color:D.fg3, fontWeight:600 }}>{k}</div>
                <div style={{ fontSize:14, color:D.fg1, fontWeight:600, marginTop:3 }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="eyebrow" style={{ marginBottom:12, color:D.fg3 }}>Dining history</div>
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {history.map(h=>(
              <div key={h.d}>
                <div style={{ fontSize:12.5, fontWeight:700, color:D.fg2, marginBottom:7 }}>{h.d}</div>
                <div style={{ display:'flex', gap:8 }}>
                  {h.meals.map(([mk,done,t])=>(
                    <div key={mk} style={{ flex:1, background: done?D.successBg:D.subtle, borderRadius:10, padding:'10px', textAlign:'center' }}>
                      <Icon name={done?'check':'minus'} size={15} color={done?D.success:D.g400} strokeWidth={2.4} />
                      <div style={{ fontSize:11, color:D.fg2, textTransform:'capitalize', marginTop:4, fontWeight:600 }}>{mk}</div>
                      <div className="mono" style={{ fontSize:10.5, color:D.fg3 }}>{t}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:10, marginTop:24 }}>
            <button className="btn btn-navy" style={{ flex:1, padding:'12px' }}><Icon name="mail" size={16} /> Message</button>
            {s.status!=='active'
              ? <button className="btn btn-orange" style={{ flex:1, padding:'12px' }}><Icon name="check" size={16} /> Mark paid</button>
              : <button className="btn btn-outline" style={{ flex:1, padding:'12px' }}><Icon name="ban" size={16} /> Suspend</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Weekend Orders board ---------- */
function AdminOrders(){
  const [orders, setOrders] = React.useState(ORDERS);
  const flow = ['pending','paid','preparing','ready','collected'];
  function advance(code){ setOrders(os=>os.map(o=>{ if(o.code!==code) return o; const i=flow.indexOf(o.status); return { ...o, status: flow[Math.min(i+1,flow.length-1)] }; })); }
  const revenue = orders.filter(o=>o.status!=='pending').reduce((s,o)=>s+o.total,0);
  const cols = [
    { key:'pending', title:'Awaiting payment' },
    { key:'paid', title:'Paid' },
    { key:'preparing', title:'Preparing' },
    { key:'ready', title:'Ready' },
    { key:'collected', title:'Collected' },
  ];
  const nextLabel = { pending:'Confirm payment', paid:'Start preparing', preparing:'Mark ready', ready:'Mark collected' };
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        <StatCard label="Orders this weekend" value={orders.length} icon="shopping-bag" tone="navy" />
        <StatCard label="Confirmed revenue" value={revenue.toLocaleString('fr-FR')} sub="FCFA" icon="wallet" tone="success" />
        <StatCard label="Awaiting payment" value={orders.filter(o=>o.status==='pending').length} icon="hourglass" tone="orange" />
        <StatCard label="Ready for pickup" value={orders.filter(o=>o.status==='ready').length} icon="package-check" tone="navy" />
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12, alignItems:'start' }}>
        {cols.map(col=>{ const items=orders.filter(o=>o.status===col.key); const meta=ORDER_STATUS[col.key];
          return (
          <div key={col.key} style={{ background:D.g50, borderRadius:14, padding:10, minHeight:200 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'4px 6px 10px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}><Dot color={meta.color} size={8} /><span style={{ fontSize:12.5, fontWeight:700, color:D.fg1 }}>{col.title}</span></div>
              <span style={{ fontSize:12, color:D.fg3, fontWeight:700 }}>{items.length}</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:9 }}>
              {items.map(o=>(
                <div key={o.code} style={{ background:'#fff', border:`1px solid ${D.border}`, borderRadius:11, padding:'11px 12px', boxShadow:'var(--shadow-sm)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <span className="mono" style={{ fontSize:11, color:D.fg3, fontWeight:600 }}>{o.code}</span>
                    <span style={{ fontSize:10.5, fontWeight:700, color: o.method==='Wave'?'#0a8fc4':D.orange600 }}>{o.method}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
                    <Avatar name={o.student.name} size={28} />
                    <div style={{ minWidth:0 }}><div style={{ fontSize:12.5, fontWeight:600, color:D.fg1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{o.student.name}</div><div style={{ fontSize:11, color:D.fg3 }}>{o.meal}</div></div>
                  </div>
                  <div style={{ fontSize:12.5, color:D.fg2, marginBottom:9 }}>{o.qty}× {o.item.name} · <strong style={{ color:D.fg1 }}>{o.total.toLocaleString('fr-FR')} F</strong></div>
                  {col.key!=='collected' && (
                    <button onClick={()=>advance(o.code)} className={col.key==='pending'?'btn btn-orange':'btn btn-outline'} style={{ width:'100%', padding:'7px', fontSize:12 }}>
                      {col.key==='pending' && <Icon name="check-circle" size={14} />} {nextLabel[col.key]}
                    </button>
                  )}
                  {col.key==='collected' && <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:5, fontSize:12, color:D.success, fontWeight:600 }}><Icon name="check" size={14} /> Done</div>}
                </div>
              ))}
              {items.length===0 && <div style={{ textAlign:'center', fontSize:12, color:D.g400, padding:'18px 0' }}>—</div>}
            </div>
          </div>
        );})}
      </div>
    </div>
  );
}

/* ---------- Menus editor ---------- */
function AdminMenus(){
  const [published, setPublished] = React.useState(true);
  const [adding, setAdding] = React.useState(false);
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <Card style={{ display:'flex', alignItems:'center', gap:18, background:`linear-gradient(120deg,${D.navy},${D.navyDeep})`, border:'none', color:'#fff' }}>
        <div style={{ width:48, height:48, borderRadius:12, background:'rgba(255,255,255,.14)', display:'grid', placeItems:'center' }}><Icon name="calendar-days" size={24} color="#fff" /></div>
        <div style={{ flex:1 }}>
          <div className="eyebrow" style={{ color:D.orange }}>Weekend Menu</div>
          <div style={{ fontFamily:D.display, fontWeight:800, fontSize:21 }}>{WEEKEND_MENU.date}</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:14 }}>
          <div style={{ textAlign:'right' }}><div style={{ fontSize:12, color:D.onNavyMuted }}>Visible to students</div><div style={{ fontWeight:700, fontSize:14 }}>{published?'Published':'Draft'}</div></div>
          <button onClick={()=>setPublished(p=>!p)} style={{ width:52, height:30, borderRadius:999, border:'none', cursor:'pointer', background: published?D.orange:'rgba(255,255,255,.2)', position:'relative', transition:'.18s' }}>
            <span style={{ position:'absolute', top:3, left: published?25:3, width:24, height:24, borderRadius:'50%', background:'#fff', transition:'.18s' }} />
          </button>
        </div>
      </Card>

      {WEEKEND_MENU.meals.map(meal=>(
        <Card key={meal.key}>
          <SectionTitle action={<button onClick={()=>setAdding(meal.key)} className="btn btn-outline" style={{ padding:'8px 16px', fontSize:13 }}><Icon name="plus" size={15} /> Add dish</button>}>
            {meal.label} <span style={{ fontWeight:400, fontSize:13, color:D.fg3 }}>· {meal.window}</span>
          </SectionTitle>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {meal.dishes.map(d=>(
              <div key={d.id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', border:`1px solid ${D.border}`, borderRadius:12 }}>
                <div style={{ width:46, height:46, borderRadius:10, background:`linear-gradient(135deg,${D.navy},${D.navy700})`, display:'grid', placeItems:'center', flexShrink:0 }}><Icon name="image" size={18} color="rgba(255,255,255,.7)" /></div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}><span style={{ fontWeight:700, fontSize:15, color:D.fg1, fontFamily:D.display }}>{d.name}</span>{d.tag && <Pill tone={d.tag==='Veg'?'success':'orange'}>{d.tag}</Pill>}</div>
                  <div style={{ fontSize:12.5, color:D.fg3, marginTop:2 }}>{d.desc}</div>
                </div>
                <div style={{ fontFamily:D.display, fontWeight:800, fontSize:16, color:D.navy, whiteSpace:'nowrap' }}>{d.price.toLocaleString('fr-FR')} F</div>
                <div style={{ display:'flex', gap:6 }}>
                  <button style={{ border:`1px solid ${D.border}`, background:'#fff', width:34, height:34, borderRadius:8, cursor:'pointer', display:'grid', placeItems:'center', color:D.fg2 }}><Icon name="pencil" size={15} /></button>
                  <button style={{ border:`1px solid ${D.border}`, background:'#fff', width:34, height:34, borderRadius:8, cursor:'pointer', display:'grid', placeItems:'center', color:D.danger }}><Icon name="trash-2" size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}

      {adding && <AddDishModal meal={adding} onClose={()=>setAdding(false)} />}
    </div>
  );
}

function AddDishModal({ meal, onClose }){
  return (
    <div onClick={onClose} style={{ position:'absolute', inset:0, zIndex:40, background:'rgba(12,21,34,.5)', display:'grid', placeItems:'center', animation:'fadeIn .15s ease' }}>
      <div onClick={e=>e.stopPropagation()} style={{ width:460, background:'#fff', borderRadius:18, padding:'24px 26px', animation:'popIn .26s ease', boxShadow:D.navy && '0 24px 60px rgba(0,0,0,.35)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
          <div style={{ fontFamily:D.display, fontWeight:700, fontSize:19 }}>Add dish · {meal}</div>
          <button onClick={onClose} style={{ border:'none', background:D.subtle, width:32, height:32, borderRadius:999, cursor:'pointer', display:'grid', placeItems:'center', color:D.fg2 }}><Icon name="x" size={17} /></button>
        </div>
        {[['Dish name','e.g. Thiéboudienne'],['Description (French)','e.g. Riz au poisson']].map(([l,p])=>(
          <div key={l} style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:600, color:D.fg2, letterSpacing:'.04em', display:'block', marginBottom:6 }}>{l.toUpperCase()}</label>
            <input placeholder={p} style={{ width:'100%', border:`1.5px solid ${D.border}`, borderRadius:8, padding:'11px 13px', fontSize:14, fontFamily:D.body, outline:'none' }} />
          </div>
        ))}
        <div style={{ display:'flex', gap:12, marginBottom:18 }}>
          <div style={{ flex:1 }}><label style={{ fontSize:12, fontWeight:600, color:D.fg2, display:'block', marginBottom:6 }}>PRICE (FCFA)</label><input placeholder="2500" style={{ width:'100%', border:`1.5px solid ${D.border}`, borderRadius:8, padding:'11px 13px', fontSize:14, fontFamily:D.mono, outline:'none' }} /></div>
          <div style={{ flex:1 }}><label style={{ fontSize:12, fontWeight:600, color:D.fg2, display:'block', marginBottom:6 }}>TAG</label><input placeholder="Signature" style={{ width:'100%', border:`1.5px solid ${D.border}`, borderRadius:8, padding:'11px 13px', fontSize:14, fontFamily:D.body, outline:'none' }} /></div>
        </div>
        <div style={{ border:`1.5px dashed ${D.border}`, borderRadius:12, padding:'18px', textAlign:'center', color:D.fg3, marginBottom:18, fontSize:13 }}>
          <Icon name="upload-cloud" size={26} color={D.g400} /><div style={{ marginTop:6 }}>Drop a dish photo or click to upload</div>
        </div>
        <div style={{ display:'flex', gap:10 }}>
          <button onClick={onClose} className="btn btn-ghost" style={{ flex:1, padding:'12px' }}>Cancel</button>
          <button onClick={onClose} className="btn btn-orange" style={{ flex:1, padding:'12px' }}><Icon name="plus" size={16} /> Add to menu</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Reports ---------- */
function AdminReports(){
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:16 }}>
        {[['Weekly attendance','All meals, Mon–Fri','file-spreadsheet'],['Unpaid students','Plans pending or expired','users'],['Weekend revenue','Wave & Orange Money','wallet']].map(([t,s,ic])=>(
          <Card key={t} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ width:42, height:42, borderRadius:10, background:D.navy+'14', color:D.navy, display:'grid', placeItems:'center' }}><Icon name={ic} size={20} /></div>
            <div><div style={{ fontFamily:D.display, fontWeight:700, fontSize:16, color:D.fg1 }}>{t}</div><div style={{ fontSize:13, color:D.fg3, marginTop:3 }}>{s}</div></div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-outline" style={{ flex:1, padding:'9px', fontSize:13 }}><Icon name="file-down" size={15} /> CSV</button>
              <button className="btn btn-outline" style={{ flex:1, padding:'9px', fontSize:13 }}><Icon name="file-text" size={15} /> PDF</button>
            </div>
          </Card>
        ))}
      </div>
      <Card>
        <SectionTitle action={<Pill tone="outline">This week</Pill>}>Daily meals served</SectionTitle>
        <BarChart data={ATTEND} keys={['breakfast','lunch','dinner']} colors={[D.navy700,D.orange,D.steel]} h={220} />
      </Card>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <Card>
          <SectionTitle>Payment methods · weekend</SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <Donut label="orders" segments={[{value:8,color:'#0a8fc4'},{value:6,color:D.orange}]} />
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}><span style={{ width:11, height:11, borderRadius:3, background:'#0a8fc4' }} /><span style={{ flex:1, fontSize:13, color:D.fg2 }}>Wave</span><span style={{ fontFamily:D.display, fontWeight:700 }}>57%</span></div>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}><span style={{ width:11, height:11, borderRadius:3, background:D.orange }} /><span style={{ flex:1, fontSize:13, color:D.fg2 }}>Orange Money</span><span style={{ fontFamily:D.display, fontWeight:700 }}>43%</span></div>
            </div>
          </div>
        </Card>
        <Card>
          <SectionTitle>Plan distribution</SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <Donut label="students" segments={[{value:STUDENTS.filter(s=>s.plan==='Annual').length,color:D.navy700},{value:STUDENTS.filter(s=>s.plan==='Semester').length,color:D.steel}]} />
            <div style={{ flex:1, display:'flex', flexDirection:'column', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}><span style={{ width:11, height:11, borderRadius:3, background:D.navy700 }} /><span style={{ flex:1, fontSize:13, color:D.fg2 }}>Annual</span><span style={{ fontFamily:D.display, fontWeight:700 }}>{STUDENTS.filter(s=>s.plan==='Annual').length}</span></div>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}><span style={{ width:11, height:11, borderRadius:3, background:D.steel }} /><span style={{ flex:1, fontSize:13, color:D.fg2 }}>Semester</span><span style={{ fontFamily:D.display, fontWeight:700 }}>{STUDENTS.filter(s=>s.plan==='Semester').length}</span></div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { AdminStudents, StudentDrawer, AdminOrders, AdminMenus, AddDishModal, AdminReports });


/* ===== Finance.jsx ===== */
/* ============================================================
   DAUST Dining — Admin: Finances & Settings
   ============================================================ */

function money(n){ return n.toLocaleString('fr-FR'); }

/* stacked monthly bars (plan + weekend) */
function StackedBar({ data, h=220 }){
  const max = Math.max(...data.map(d=>d.plan+d.weekend))*1.08;
  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-end', gap:16, height:h, padding:'0 4px' }}>
        {data.map(d=>{ const total=d.plan+d.weekend;
          return (
          <div key={d.m} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:8, height:'100%' }}>
            <div style={{ fontSize:11, color:D.fg3, fontWeight:600 }}>{fcfaShort(total)}</div>
            <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'flex-end', width:'62%', maxWidth:46 }}>
              <div title={`Weekend ${fcfaShort(d.weekend)}`} style={{ height:`${Math.max(d.weekend/max*100,1.5)}%`, background:D.orange, borderRadius:'5px 5px 0 0', minHeight:3 }} />
              <div title={`Plans ${fcfaShort(d.plan)}`} style={{ height:`${Math.max(d.plan/max*100,1.5)}%`, background:D.navy700, minHeight:3 }} />
            </div>
            <div style={{ fontSize:12, color:D.fg3, fontWeight:600 }}>{d.m}</div>
          </div>
        );})}
      </div>
      <div style={{ display:'flex', gap:18, marginTop:14, justifyContent:'center' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:D.fg2 }}><span style={{ width:11, height:11, borderRadius:3, background:D.navy700 }} />Meal plans</div>
        <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:D.fg2 }}><span style={{ width:11, height:11, borderRadius:3, background:D.orange }} />Weekend orders</div>
      </div>
    </div>
  );
}

/* ---------- Finances ---------- */
function AdminFinance(){
  const f = termFinances();
  const [filter, setFilter] = React.useState('all');
  const [q, setQ] = React.useState('');
  const marginPct = Math.round(f.margin / f.revenue * 100);
  const txns = TRANSACTIONS.filter(t=>{
    if (filter!=='all' && t.type!==filter) return false;
    if (q && !(`${t.student.name} ${t.id}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });
  const methodColor = { 'Wave':'#0a8fc4', 'Orange Money':D.orange600, 'Bank transfer':D.navy700, 'Cash':D.fg2 };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
        <StatCard label="Term revenue" value={fcfaShort(f.revenue)} sub="FCFA · Spring 2026" icon="trending-up" tone="success" delta={9} />
        <StatCard label="Meal-plan revenue" value={fcfaShort(f.planRevenue)} sub="semester + annual" icon="badge-check" tone="navy" />
        <StatCard label="Weekend revenue" value={fcfaShort(f.weekendRevenue)} sub="Wave + Orange Money" icon="utensils" tone="orange" delta={12} />
        <StatCard label="Outstanding" value={fcfaShort(f.outstanding)} sub="unpaid / expired plans" icon="alert-triangle" tone="danger" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1.55fr 1fr', gap:16 }}>
        <Card>
          <SectionTitle action={<Pill tone="outline">Jan–May</Pill>}>Revenue by month</SectionTitle>
          <StackedBar data={REV_TREND} h={210} />
        </Card>
        {/* margin */}
        <Card style={{ display:'flex', flexDirection:'column' }}>
          <SectionTitle>Gross margin</SectionTitle>
          <div style={{ display:'flex', alignItems:'center', gap:18, marginBottom:16 }}>
            <Donut label="margin" center={marginPct+'%'} segments={[{value:f.margin,color:D.success},{value:f.foodCost,color:D.g200}]} size={134} />
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:D.display, fontWeight:700, fontSize:18, color:D.fg1, lineHeight:1.1 }}>Healthy surplus</div>
              <div style={{ fontSize:12.5, color:D.fg3, marginTop:5 }}>Term revenue comfortably covers food &amp; operating cost.</div>
            </div>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:9, borderTop:`1px solid ${D.g100}`, paddingTop:14 }}>
            <LineKV label="Revenue" value={fcfa(f.revenue)} />
            <LineKV label={`Food cost · ${money(f.mealsServedTerm)} meals`} value={'– '+fcfa(f.foodCost)} muted />
            <LineKV label="Gross margin" value={fcfa(f.margin)} strong />
          </div>
        </Card>
      </div>

      {/* settlement */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
        {SETTLEMENT.map(s=>(
          <Card key={s.provider} style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:11 }}>
              <div style={{ width:42, height:42, borderRadius:11, background:s.color, color:'#fff', display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:s.provider.length>5?13:18 }}>{s.provider==='Wave'?'W':'OM'}</div>
              <div><div style={{ fontWeight:700, fontSize:15, color:D.fg1 }}>{s.provider}</div><div style={{ fontSize:11.5, color:D.fg3 }}>{s.account}</div></div>
            </div>
            <div>
              <div style={{ fontFamily:D.display, fontWeight:800, fontSize:26, color:D.fg1, lineHeight:1 }}>{fcfa(s.balance)}</div>
              <div style={{ fontSize:12, color:D.fg3, marginTop:4 }}>Available to settle · fee {fcfa(s.fee)}</div>
            </div>
            <button className="btn btn-outline" style={{ padding:'9px', fontSize:13 }}><Icon name="arrow-down-to-line" size={15} /> Withdraw to bank</button>
          </Card>
        ))}
        <Card style={{ display:'flex', flexDirection:'column', gap:12, background:`linear-gradient(135deg,${D.navy},${D.navyDeep})`, border:'none', color:'#fff' }}>
          <div style={{ display:'flex', alignItems:'center', gap:11 }}>
            <div style={{ width:42, height:42, borderRadius:11, background:'rgba(255,255,255,.14)', display:'grid', placeItems:'center' }}><Icon name="landmark" size={20} color="#fff" /></div>
            <div><div style={{ fontWeight:700, fontSize:15 }}>Next payout</div><div style={{ fontSize:11.5, color:D.onNavyMuted }}>Auto-settle · weekly</div></div>
          </div>
          <div>
            <div style={{ fontFamily:D.display, fontWeight:800, fontSize:26, lineHeight:1 }}>{fcfa(SETTLEMENT.reduce((a,s)=>a+s.balance,0))}</div>
            <div style={{ fontSize:12, color:D.onNavyMuted, marginTop:4 }}>Scheduled · Friday 31 May</div>
          </div>
          <button className="btn" style={{ background:D.orange, color:'#fff', padding:'9px', fontSize:13 }}><Icon name="zap" size={15} /> Settle now</button>
        </Card>
      </div>

      {/* transactions ledger */}
      <Card pad={0}>
        <div style={{ padding:'16px 20px', display:'flex', alignItems:'center', gap:12, borderBottom:`1px solid ${D.border}`, flexWrap:'wrap' }}>
          <div style={{ fontFamily:D.display, fontWeight:700, fontSize:17, color:D.fg1, marginRight:'auto' }}>Transactions</div>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:D.subtle, borderRadius:8, padding:'8px 12px', width:230 }}>
            <Icon name="search" size={15} color={D.g400} /><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search student or ID…" style={{ border:'none', outline:'none', background:'transparent', fontSize:13, fontFamily:D.body, flex:1, color:D.fg1 }} />
          </div>
          <div style={{ display:'flex', gap:5, background:D.g100, padding:4, borderRadius:999 }}>
            {[['all','All'],['plan','Plans'],['weekend','Weekend'],['refund','Refunds']].map(([k,l])=>(
              <button key={k} onClick={()=>setFilter(k)} style={{ border:'none', cursor:'pointer', borderRadius:999, padding:'6px 13px', fontFamily:D.body, fontWeight:600, fontSize:12.5,
                background: filter===k?'#fff':'transparent', color: filter===k?D.navy:D.fg2, boxShadow: filter===k?'var(--shadow-sm)':'none' }}>{l}</button>
            ))}
          </div>
          <button className="btn btn-outline" style={{ padding:'9px 16px', fontSize:13 }}><Icon name="download" size={15} /> Export</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1.3fr 1.8fr 1.2fr 1.2fr 1fr 1fr', padding:'12px 20px', borderBottom:`1px solid ${D.border}`, fontSize:11, letterSpacing:'.06em', textTransform:'uppercase', color:D.fg3, fontWeight:700 }}>
          <div>Reference</div><div>Student</div><div>Type</div><div>Method</div><div>When</div><div style={{ textAlign:'right' }}>Amount</div>
        </div>
        <div className="scroll" style={{ maxHeight:360, overflowY:'auto' }}>
          {txns.map((t,i)=>{ const meta=TXN_TYPES[t.type];
            return (
            <div key={t.id} style={{ display:'grid', gridTemplateColumns:'1.3fr 1.8fr 1.2fr 1.2fr 1fr 1fr', alignItems:'center', padding:'12px 20px', borderBottom: i<txns.length-1?`1px solid ${D.g100}`:'none' }}>
              <div className="mono" style={{ fontSize:12.5, color:D.fg2, fontWeight:600 }}>{t.id}</div>
              <div style={{ display:'flex', alignItems:'center', gap:9 }}><Avatar name={t.student.name} size={28} /><span style={{ fontSize:13.5, color:D.fg1, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{t.student.name}</span></div>
              <div style={{ display:'flex', alignItems:'center', gap:7, fontSize:13, color:D.fg2 }}><span style={{ width:24, height:24, borderRadius:6, background:meta.color+'18', color:meta.color, display:'grid', placeItems:'center' }}><Icon name={meta.icon} size={13} /></span>{meta.label}</div>
              <div style={{ fontSize:13, fontWeight:600, color:methodColor[t.method] }}>{t.method}</div>
              <div style={{ fontSize:12.5, color:D.fg3 }}>{t.when}</div>
              <div style={{ textAlign:'right', fontFamily:D.display, fontWeight:700, fontSize:14, color: t.amount<0?D.danger:D.fg1 }}>
                {t.amount<0?'– ':''}{money(Math.abs(t.amount))} F
                {t.status==='pending' && <div style={{ fontSize:10, color:D.orange600, fontWeight:600 }}>pending</div>}
                {t.status==='refunded' && <div style={{ fontSize:10, color:D.danger, fontWeight:600 }}>refunded</div>}
              </div>
            </div>
          );})}
          {txns.length===0 && <div style={{ padding:'30px', textAlign:'center', color:D.g400, fontSize:13 }}>No transactions match.</div>}
        </div>
      </Card>
    </div>
  );
}

function LineKV({ label, value, muted, strong }){
  return <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
    <span style={{ fontSize:13, color: strong?D.fg1:D.fg3, fontWeight: strong?600:400 }}>{label}</span>
    <span style={{ fontFamily:D.display, fontWeight: strong?800:600, fontSize: strong?16:14, color: muted?D.fg3:(strong?D.success:D.fg1) }}>{value}</span>
  </div>;
}

/* ---------- Settings ---------- */
function AdminSettings(){
  const [weekendOpen, setWeekendOpen] = React.useState(true);
  const [autoSettle, setAutoSettle] = React.useState(true);
  const [block2x, setBlock2x] = React.useState(true);
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, alignItems:'start' }}>
      <Card>
        <SectionTitle>Meal service windows</SectionTitle>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {MEALS.map(m=>(
            <div key={m.key} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
              <span style={{ width:34, height:34, borderRadius:9, background:D.subtle, display:'grid', placeItems:'center', color:D.navy }}><Icon name={m.icon} size={17} /></span>
              <div style={{ flex:1, fontWeight:600, fontSize:14, color:D.fg1 }}>{m.label}</div>
              <input defaultValue={m.window.split(' – ')[0]} style={{ width:64, textAlign:'center', border:`1.5px solid ${D.border}`, borderRadius:7, padding:'7px', fontFamily:D.mono, fontSize:13 }} />
              <span style={{ color:D.fg3 }}>–</span>
              <input defaultValue={m.window.split(' – ')[1]} style={{ width:64, textAlign:'center', border:`1.5px solid ${D.border}`, borderRadius:7, padding:'7px', fontFamily:D.mono, fontSize:13 }} />
            </div>
          ))}
          <SettingToggle label="Block a second scan in the same meal" sub="Staff can still override" on={block2x} set={setBlock2x} />
        </div>
      </Card>

      <Card>
        <SectionTitle>Plan pricing</SectionTitle>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {Object.entries(PLAN_PRICES).map(([plan,price])=>(
            <div key={plan} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
              <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>{plan} plan</div><div style={{ fontSize:11.5, color:D.fg3 }}>{plan==='Annual'?'Sept–Aug · 3 meals/day':'One semester · 3 meals/day'}</div></div>
              <div style={{ display:'flex', alignItems:'center', gap:6, border:`1.5px solid ${D.border}`, borderRadius:8, padding:'7px 11px' }}>
                <input defaultValue={money(price)} style={{ width:78, border:'none', outline:'none', fontFamily:D.mono, fontSize:13.5, textAlign:'right' }} />
                <span style={{ fontSize:12, color:D.fg3 }}>FCFA</span>
              </div>
            </div>
          ))}
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', background:D.subtle, borderRadius:10 }}>
            <div style={{ flex:1, fontSize:13.5, color:D.fg2 }}>Cost per meal (for margin)</div>
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'#fff', border:`1.5px solid ${D.border}`, borderRadius:8, padding:'7px 11px' }}>
              <input defaultValue={money(COST_PER_MEAL)} style={{ width:50, border:'none', outline:'none', fontFamily:D.mono, fontSize:13.5, textAlign:'right' }} /><span style={{ fontSize:12, color:D.fg3 }}>FCFA</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <SectionTitle>Payment accounts</SectionTitle>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {SETTLEMENT.map(s=>(
            <div key={s.provider} style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
              <div style={{ width:34, height:34, borderRadius:9, background:s.color, color:'#fff', display:'grid', placeItems:'center', fontFamily:D.display, fontWeight:800, fontSize:s.provider.length>5?11:15 }}>{s.provider==='Wave'?'W':'OM'}</div>
              <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>{s.provider}</div><div className="mono" style={{ fontSize:12, color:D.fg3 }}>{s.account.split('· ')[1]}</div></div>
              <Pill tone="success"><Dot color={D.success} size={6} /> Connected</Pill>
            </div>
          ))}
          <SettingToggle label="Weekly auto-settlement" sub="Move balances to bank every Friday" on={autoSettle} set={setAutoSettle} />
        </div>
      </Card>

      <Card>
        <SectionTitle>Weekend ordering</SectionTitle>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <SettingToggle label="Accept weekend orders" sub="Students can order & pay for Sat/Sun meals" on={weekendOpen} set={setWeekendOpen} />
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
            <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>Order cut-off</div><div style={{ fontSize:11.5, color:D.fg3 }}>Last time students can order</div></div>
            <select defaultValue="Fri 18:00" style={{ border:`1.5px solid ${D.border}`, borderRadius:8, padding:'8px 12px', fontFamily:D.body, fontSize:13 }}><option>Fri 18:00</option><option>Fri 21:00</option><option>Sat 08:00</option></select>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
            <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>Scanner stations</div><div style={{ fontSize:11.5, color:D.fg3 }}>Entrance A · Entrance B · Staff gate</div></div>
            <Pill tone="navy">3 active</Pill>
          </div>
        </div>
      </Card>
    </div>
  );
}

function SettingToggle({ label, sub, on, set }){
  return (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 13px', border:`1px solid ${D.border}`, borderRadius:10 }}>
      <div style={{ flex:1 }}><div style={{ fontWeight:600, fontSize:14, color:D.fg1 }}>{label}</div>{sub && <div style={{ fontSize:11.5, color:D.fg3 }}>{sub}</div>}</div>
      <button onClick={()=>set(!on)} style={{ width:46, height:27, borderRadius:999, border:'none', cursor:'pointer', background: on?D.success:D.g300, position:'relative', transition:'.18s', flexShrink:0 }}>
        <span style={{ position:'absolute', top:3, left: on?22:3, width:21, height:21, borderRadius:'50%', background:'#fff', transition:'.18s', boxShadow:'var(--shadow-sm)' }} />
      </button>
    </div>
  );
}

Object.assign(window, { AdminFinance, AdminSettings });


/* ===== App.jsx ===== */
/* ============================================================
   DAUST Dining — App shell: hub, device frames, scaling, tweaks
   ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "scanResult": "flood",
  "scanSound": true,
  "hubAccent": "#ed8425"
}/*EDITMODE-END*/;

/* fit a fixed-size frame into available space */
function useFit(w, h, pad = 0.96){
  const [scale, setScale] = React.useState(1);
  React.useLayoutEffect(()=>{
    function fit(){
      const aw = window.innerWidth * pad, ah = (window.innerHeight - 16) * pad;
      setScale(Math.min(aw/w, ah/h, 1));
    }
    fit(); window.addEventListener('resize', fit); return ()=>window.removeEventListener('resize', fit);
  }, [w, h, pad]);
  return scale;
}

function FitFrame({ w, h, children }){
  const scale = useFit(w, h);
  return (
    <div className="fit-host">
      <div style={{ width:w*scale, height:h*scale, position:'relative', transition:'width .2s ease, height .2s ease' }}>
        <div style={{ width:w, height:h, transform:`scale(${scale})`, transformOrigin:'top left', position:'absolute', top:0, left:0 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

/* ---- device frames ---- */
function TabletFrame({ children }){
  return (
    <div style={{ width:1180, height:800, background:'#0c1118', borderRadius:34, padding:'20px 24px', boxShadow:'0 50px 120px rgba(0,0,0,.55), inset 0 0 0 2px rgba(255,255,255,.04)', position:'relative' }}>
      <div style={{ position:'absolute', top:'50%', right:9, transform:'translateY(-50%)', width:6, height:6, borderRadius:'50%', background:'rgba(255,255,255,.18)' }} />
      <div style={{ width:'100%', height:'100%', borderRadius:16, overflow:'hidden', background:'#fff', position:'relative' }}>{children}</div>
    </div>
  );
}
function DesktopFrame({ children }){
  return (
    <div style={{ width:1340, height:858, background:'#fff', borderRadius:14, overflow:'hidden', boxShadow:'0 50px 120px rgba(0,0,0,.5)', display:'flex', flexDirection:'column' }}>
      <div style={{ height:42, background:'#eef1f5', borderBottom:`1px solid ${D.border}`, display:'flex', alignItems:'center', padding:'0 16px', gap:8, flexShrink:0 }}>
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#ff5f57' }} /><span style={{ width:12, height:12, borderRadius:'50%', background:'#febc2e' }} /><span style={{ width:12, height:12, borderRadius:'50%', background:'#28c840' }} />
        <div style={{ margin:'0 auto', background:'#fff', borderRadius:8, padding:'5px 18px', fontSize:12.5, color:D.fg3, fontFamily:D.body, display:'flex', alignItems:'center', gap:7, minWidth:280, justifyContent:'center' }}>
          <Icon name="lock" size={12} /> dining.daust.org/admin
        </div>
        <span style={{ width:60 }} />
      </div>
      <div style={{ flex:1, minHeight:0 }}>{children}</div>
    </div>
  );
}
function PhoneFrame({ children }){
  return (
    <div style={{ width:392, height:812, background:'#0c1118', borderRadius:46, padding:11, boxShadow:'0 50px 110px rgba(0,0,0,.55), inset 0 0 0 2px rgba(255,255,255,.05)', position:'relative' }}>
      <div style={{ width:'100%', height:'100%', borderRadius:36, overflow:'hidden', background:'#fff', position:'relative' }}>
        <div style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', width:124, height:30, background:'#0c1118', borderRadius:'0 0 18px 18px', zIndex:50 }} />
        {children}
      </div>
    </div>
  );
}

/* ---- Hub ---- */
function Hub({ onPick }){
  const roles = [
    { key:'scanner', tag:'Entrance · Tablet', title:'Scanner Station', desc:'Staff scan student QR codes — instant green or red to enter the dining hall.', icon:'scan-line', accent:D.orange },
    { key:'admin', tag:'Back office · Desktop', title:'Admin Console', desc:'Track attendance, manage students, confirm weekend payments, publish menus.', icon:'layout-dashboard', accent:D.navy700 },
    { key:'student', tag:'Student · Mobile', title:'Student App', desc:'Carry a dining pass, browse weekend menus, pay with Wave or Orange Money.', icon:'smartphone', accent:D.steel },
  ];
  return (
    <div className="scroll" style={{ position:'relative', zIndex:2, width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'40px 24px', color:'#fff' }}>
      <img src="assets/logo-daust-white.png" alt="DAUST" style={{ height:36, marginBottom:26, opacity:.96 }} />
      <div className="eyebrow" style={{ color:D.orange }}>Dining Platform</div>
      <h1 style={{ fontFamily:D.display, fontWeight:800, fontSize:'min(8vw,56px)', letterSpacing:'.01em', margin:'10px 0 8px', textAlign:'center', lineHeight:1.02 }}>One pass. Three meals. Every day.</h1>
      <p style={{ fontFamily:D.body, fontSize:16, color:D.onNavyMuted, maxWidth:580, textAlign:'center', lineHeight:1.6, margin:'0 0 14px' }}>
        From the weekday entrance scan to weekend orders paid by mobile money — the complete dining system for DAUST.
      </p>
      <TriDash w={34} style={{ marginBottom:34 }} />
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0,300px))', gap:18, width:'100%', maxWidth:960 }}>
        {roles.map(r=>(
          <button key={r.key} onClick={()=>onPick(r.key)} style={{ textAlign:'left', cursor:'pointer', border:'1px solid rgba(255,255,255,.12)', borderRadius:18, padding:'24px 22px', background:'rgba(255,255,255,.05)', color:'#fff', backdropFilter:'blur(8px)', transition:'.18s', display:'flex', flexDirection:'column', gap:14 }}
            onMouseEnter={e=>{ e.currentTarget.style.background='rgba(255,255,255,.1)'; e.currentTarget.style.transform='translateY(-4px)'; e.currentTarget.style.borderColor=r.accent; }}
            onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,.05)'; e.currentTarget.style.transform='none'; e.currentTarget.style.borderColor='rgba(255,255,255,.12)'; }}>
            <div style={{ width:52, height:52, borderRadius:14, background:r.accent, display:'grid', placeItems:'center', boxShadow:`0 8px 24px ${r.accent}66` }}><Icon name={r.icon} size={26} color="#fff" /></div>
            <div>
              <div style={{ fontSize:11, letterSpacing:'.1em', textTransform:'uppercase', color:D.onNavyMuted, fontWeight:600 }}>{r.tag}</div>
              <div style={{ fontFamily:D.display, fontWeight:700, fontSize:21, marginTop:5 }}>{r.title}</div>
            </div>
            <p style={{ fontSize:13.5, color:D.onNavyMuted, lineHeight:1.55, margin:0, flex:1 }}>{r.desc}</p>
            <div style={{ display:'flex', alignItems:'center', gap:7, color:r.accent===D.steel?'#cdd5dd':r.accent, fontWeight:700, fontSize:14 }}>Open <Icon name="arrow-right" size={16} /></div>
          </button>
        ))}
      </div>
      <div style={{ marginTop:30, fontSize:12.5, color:'rgba(255,255,255,.45)', display:'flex', alignItems:'center', gap:8 }}>
        <Icon name="info" size={14} /> Interactive prototype · sample data · Dakar American University of Science &amp; Technology
      </div>
    </div>
  );
}

/* ---- App ---- */
function App(){
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [surface, setSurface] = React.useState(null);

  React.useEffect(()=>{
    function onKey(e){ if (e.key === 'Escape' && surface) setSurface(null); }
    window.addEventListener('keydown', onKey); return ()=>window.removeEventListener('keydown', onKey);
  }, [surface]);

  return (
    <div className="stage">
      <div className="stage-bg" style={{ opacity: surface?0.55:1, transition:'opacity .3s' }} />
      {!surface && <Hub onPick={setSurface} />}

      {surface && (
        <>
          <button onClick={()=>setSurface(null)} title="Back to all surfaces (Esc)" style={{ position:'fixed', bottom:16, left:16, zIndex:100, display:'flex', alignItems:'center', gap:8, background:'rgba(20,26,33,.62)', backdropFilter:'blur(10px)', border:'1px solid rgba(255,255,255,.18)', color:'#fff', borderRadius:999, padding:'10px 18px', cursor:'pointer', fontFamily:D.body, fontWeight:600, fontSize:13, boxShadow:'0 8px 24px rgba(0,0,0,.3)' }}>
            <Icon name="grid-3x3" size={15} /> All surfaces
          </button>
          {surface==='scanner' && <FitFrame w={1228} h={840}><TabletFrame><ScannerStation onExit={()=>setSurface(null)} resultStyle={t.scanResult} sound={t.scanSound} /></TabletFrame></FitFrame>}
          {surface==='admin' && <FitFrame w={1340} h={858}><DesktopFrame><AdminApp onExit={()=>setSurface(null)} /></DesktopFrame></FitFrame>}
          {surface==='student' && <FitFrame w={392} h={812}><PhoneFrame><StudentApp onExit={()=>setSurface(null)} /></PhoneFrame></FitFrame>}
        </>
      )}

      <TweaksPanel>
        <TweakSection label="Scanner result" />
        <TweakRadio label="Result style" value={t.scanResult} options={['flood','card','banner']} onChange={v=>setTweak('scanResult', v)} />
        <TweakToggle label="Scan sound" value={t.scanSound} onChange={v=>setTweak('scanSound', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

