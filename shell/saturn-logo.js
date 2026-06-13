// <saturn-logo> — animated inline-SVG Saturn planet, usable at any size.
// Set width/height via CSS on the element; the SVG scales to fill.
// Animations respect prefers-reduced-motion.
class SaturnLogo extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) return;
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
<style>
  :host { display: inline-block; }
  svg { width: 100%; height: 100%; overflow: visible; display: block; }
  .sg-wrap {
    animation: sg-float 6s ease-in-out infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
  .sg-moon {
    animation: sg-orbit 8s linear infinite;
    transform-origin: 50px 40px;
  }
  .sg-ring-glow {
    animation: sg-ring-pulse 4s ease-in-out infinite;
  }
  @keyframes sg-float {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-3px); }
  }
  @keyframes sg-ring-pulse {
    0%, 100% { opacity: 0.85; }
    50%       { opacity: 1; }
  }
  @media (prefers-reduced-motion: reduce) {
    .sg-wrap, .sg-moon, .sg-ring-glow { animation: none; }
  }
</style>
<svg viewBox="0 0 100 80" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="sg-sp" cx="38%" cy="30%" r="70%">
      <stop offset="0%"   stop-color="#f5e49c"/>
      <stop offset="40%"  stop-color="#e0b84a"/>
      <stop offset="75%"  stop-color="#c28a28"/>
      <stop offset="100%" stop-color="#7a4a10"/>
    </radialGradient>
    <linearGradient id="sg-rg" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%"   stop-color="#c8a960" stop-opacity="0.25"/>
      <stop offset="20%"  stop-color="#e8d07a" stop-opacity="0.9"/>
      <stop offset="50%"  stop-color="#f0e090" stop-opacity="1"/>
      <stop offset="80%"  stop-color="#e8d07a" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="#c8a960" stop-opacity="0.25"/>
    </linearGradient>
    <radialGradient id="sg-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stop-color="#e8c97a" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#e8c97a" stop-opacity="0"/>
    </radialGradient>
    <filter id="sg-sf" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <g class="sg-wrap">
    <!-- outer glow halo -->
    <ellipse cx="50" cy="40" rx="34" ry="34" fill="url(#sg-glow)"/>
    <!-- back ring arc (bottom half of ring ellipse, behind sphere) -->
    <path class="sg-ring-glow"
      d="M 6 40 A 44 11 0 0 0 94 40"
      fill="none" stroke="url(#sg-rg)" stroke-width="6" stroke-linecap="round"/>
    <!-- planet sphere -->
    <circle cx="50" cy="40" r="27" fill="url(#sg-sp)" filter="url(#sg-sf)"/>
    <!-- subtle atmospheric bands -->
    <ellipse cx="50" cy="34" rx="26" ry="3.5" fill="rgba(200,150,30,0.13)"/>
    <ellipse cx="50" cy="46" rx="26" ry="2.5" fill="rgba(120,80,10,0.11)"/>
    <!-- front ring arc (top half, in front of sphere) -->
    <path class="sg-ring-glow"
      d="M 6 40 A 44 11 0 0 1 94 40"
      fill="none" stroke="url(#sg-rg)" stroke-width="6" stroke-linecap="round"/>
    <!-- orbiting moons — layered radii / speeds / directions for a livelier 3D feel -->
    <circle class="sg-moon" cx="50" cy="13" r="2.4" fill="rgba(255,255,255,0.88)">
      <animateTransform attributeName="transform" type="rotate"
        from="0 50 40" to="360 50 40" dur="8s" repeatCount="indefinite"/>
    </circle>
    <circle class="sg-moon" cx="50" cy="6" r="1.7" fill="rgba(200,225,255,0.82)">
      <animateTransform attributeName="transform" type="rotate"
        from="140 50 40" to="500 50 40" dur="13s" repeatCount="indefinite"/>
    </circle>
    <circle class="sg-moon" cx="50" cy="21" r="1.4" fill="rgba(255,240,200,0.85)">
      <animateTransform attributeName="transform" type="rotate"
        from="300 50 40" to="-60 50 40" dur="5.5s" repeatCount="indefinite"/>
    </circle>
  </g>
</svg>`;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      shadow.querySelectorAll('animateTransform').forEach(a => a.setAttribute('repeatCount', '0'));
    }
  }
}
if (!customElements.get('saturn-logo')) {
  customElements.define('saturn-logo', SaturnLogo);
}
