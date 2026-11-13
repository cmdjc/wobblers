export const BG_VS = `varying vec3 vD;
        void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export const BG_FS = `uniform float uTime; varying vec3 vD;
        void main(){
          vec3 d = normalize(vD);
          float t = uTime * 0.12;
          float a = d.x*3.0 + sin(d.y*4.0 + t*2.0)*1.2 + t;
          float b = d.y*3.5 + sin(d.x*3.0 - t*1.5)*1.4;
          float f = sin(a)*0.5 + sin(b)*0.5 + sin((a+b)*0.7 + t)*0.5;
          float band = abs(fract(f*1.6) - 0.5);
          float line = smoothstep(0.43, 0.5, band);
          vec3 c1 = vec3(0.07,0.03,0.17);
          vec3 c2 = vec3(0.02,0.18,0.24);
          vec3 col = mix(c1, c2, f*0.5 + 0.5);
          col += line * vec3(0.55,0.2,0.6) * 0.4;
          gl_FragColor = vec4(col,1.0);
        }`;

export const VS = `
    uniform float uTime; uniform vec3 uAxis; uniform float uQ; uniform vec3 uLag; uniform float uRip;
    uniform vec3 uPressDir; uniform float uPress;
    varying vec3 vN; varying vec3 vV; varying vec3 vLocal; varying float vRip; varying float vDent;
    void main(){
      vec3 p = position;
      vec3 nrm = normalize(position);
      float c = max(dot(nrm, uPressDir), 0.0);
      float w = c * c * c;
      p -= uPressDir * uPress * 0.26 * w;
      vec3 side = p - uPressDir * dot(p, uPressDir);
      p += side * uPress * 0.12 * w;
      p += uAxis * dot(p, uAxis) * uQ;
      vec3 perp = p - uAxis * dot(p, uAxis);
      p -= perp * uQ * 0.5;
      float l = length(uLag);
      if (l > 0.0001) {
        vec3 dl = uLag / l;
        p += uLag * (0.5 + 0.5 * dot(nrm, dl));
      }
      p += normal * uRip * 0.5 * sin(dot(position, vec3(9.0, 11.0, 7.0)) + uTime * 22.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vec3 nl = normal + (uPressDir - normal * dot(normal, uPressDir)) * uPress * 2.2 * c * c;
      vN = normalize(normalMatrix * nl);
      vV = normalize(-mv.xyz);
      vLocal = position;
      vRip = uRip;
      vDent = uPress * w;
      gl_Position = projectionMatrix * mv;
    }`;

export const FS = `
    uniform float uTime; uniform vec3 uColA; uniform vec3 uColB; uniform float uHue; uniform float uStone; uniform float uSick; uniform float uGold; uniform float uGray;
    varying vec3 vN; varying vec3 vV; varying vec3 vLocal; varying float vRip; varying float vDent;
    void main(){
      vec3 N = normalize(vN); vec3 V = normalize(vV);
      float fres = pow(1.0 - max(dot(N, V), 0.0), 2.5);
      float s = sin(vLocal.y*9.0 + sin(vLocal.x*6.0 + uTime*1.5)*1.6 + uHue*6.0)*0.5 + 0.5;
      float pat = smoothstep(0.42, 0.58, s);
      vec3 base = mix(uColA, uColB, pat);
      vec3 L = normalize(vec3(0.4, 0.8, 0.6));
      float diff = 0.45 + 0.55 * max(dot(N, L), 0.0);
      vec3 H = normalize(L + V);
      float spec = pow(max(dot(N, H), 0.0), 48.0);
      vec3 iri = 0.5 + 0.5 * cos(6.2831 * (fres*1.3 + uTime*0.08 + uHue + vec3(0.0, 0.33, 0.67)));
      vec3 col = base * diff + iri * fres * 0.85 + spec * 0.9 + vRip * vec3(2.0, 1.2, 1.5);
      col = mix(col, col * vec3(0.55, 1.15, 0.45) + vec3(0.02, 0.1, 0.0), uSick * 0.65);
      float lum = dot(col, vec3(0.3, 0.59, 0.11));
      vec3 stoneCol = vec3(lum * 0.5 + 0.28) * (0.86 + 0.14 * sin(vLocal.x * 31.0 + vLocal.y * 27.0));
      col = mix(col, stoneCol, uStone);
      col += uGold * vec3(1.0, 0.78, 0.3) * (fres * 1.1 + 0.12 * (0.5 + 0.5 * sin(uTime * 6.0 + vLocal.y * 12.0)));
      col = mix(col, vec3(dot(col, vec3(0.3, 0.59, 0.11))) * 0.8, uGray);
      col *= 1.0 - clamp(vDent, 0.0, 1.4) * 0.35;
      gl_FragColor = vec4(col, 1.0);
    }`;

export const BLOB_VS = `uniform float uSize; attribute float aSpeed; varying float vSpeed;
      void main(){ vSpeed = aSpeed; gl_PointSize = uSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const BLOB_FS = `uniform float uAmp; varying float vSpeed;
      void main(){
        vec2 d = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(d, d);
        if (r2 > 1.0) discard;
        float f = (1.0 - r2); f = f * f * uAmp;
        gl_FragColor = vec4(f, f * vSpeed, 0.0, 1.0);
      }`;

export const FLUID_VS = `varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const FLUID_FS = `
      uniform sampler2D uField; uniform vec2 uTexel; uniform float uTime, uOpacity, uGlow, uThr, uBump;
      uniform vec3 uDeep, uLight; uniform vec4 uBox; varying vec2 vUv;
      void main(){
        if (vUv.x < uBox.x || vUv.y < uBox.y || vUv.x > uBox.z || vUv.y > uBox.w) discard;
        vec4 c = texture2D(uField, vUv);
        float d = c.r;
        float edge = smoothstep(uThr - 0.05, uThr + 0.03, d);
        if (edge < 0.01) discard;
        vec2 e = uTexel * 2.0;
        float dx = texture2D(uField, vUv + vec2(e.x, 0.0)).r - texture2D(uField, vUv - vec2(e.x, 0.0)).r;
        float dy = texture2D(uField, vUv + vec2(0.0, e.y)).r - texture2D(uField, vUv - vec2(0.0, e.y)).r;
        vec3 N = normalize(vec3(-dx * uBump, -dy * uBump, 1.0));
        vec3 L = normalize(vec3(-0.4, 0.7, 0.6));
        float diff = 0.55 + 0.45 * max(dot(N, L), 0.0);
        vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
        float spec = pow(max(dot(N, H), 0.0), 40.0);
        float thick = smoothstep(uThr, 0.9, d);
        vec3 col = mix(uLight, uDeep, thick) * diff;
        float rim = 1.0 - smoothstep(uThr, uThr + 0.25, d);
        col += rim * 0.25 * uLight + spec * 0.7;
        float speed = c.g / max(c.r, 0.001);
        col = mix(col, vec3(1.0), smoothstep(0.55, 1.0, speed) * 0.35 * (1.0 - thick * 0.5));
        float lava = sin(vUv.x * 22.0 + uTime * 1.3) * sin(vUv.y * 17.0 - uTime * 1.1) * 0.5 + 0.5;
        col += uGlow * mix(uLight, vec3(1.0, 0.85, 0.4), 0.5) * (0.35 + 0.5 * lava) * (0.4 + 0.6 * thick);
        float alpha = edge * mix(uOpacity * 0.75, uOpacity, thick);
        gl_FragColor = vec4(col, alpha);
      }`;

export const SPARK_VS = `uniform float uPx; attribute vec3 aColor; attribute float aAlpha; attribute float aSize; varying vec3 vC; varying float vA;
      void main(){ vC = aColor; vA = aAlpha; gl_PointSize = min(aSize * uPx, 60.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const SPARK_FS = `varying vec3 vC; varying float vA;
      void main(){
        vec2 d = gl_PointCoord * 2.0 - 1.0;
        float r = length(d);
        if (r > 1.0) discard;
        float core = pow(1.0 - r, 2.0);
        float cr = smoothstep(0.14, 0.0, min(abs(d.x), abs(d.y))) * (1.0 - r);
        float a = (core * 0.9 + cr) * vA;
        gl_FragColor = vec4(vC * a, a);
      }`;

export const EYE_FS = `
    uniform float uTime, uPupil, uSlit, uGlow, uOpacity; uniform vec3 uIris;
    varying vec3 vN; varying vec3 vV; varying vec3 vLocal; varying float vRip; varying float vDent;
    void main(){
      vec3 N = normalize(vN); vec3 V = normalize(vV);
      vec3 p = normalize(vLocal);
      vec2 q = p.xy;
      float r = length(q);
      float front = step(0.0, p.z);
      float az = atan(q.y, q.x);
      vec3 sclera = vec3(0.97, 0.95, 1.0);
      float vein = smoothstep(0.9, 1.0, sin(az * 9.0 + sin(r * 8.0 + uTime * 0.2) * 2.0)) * smoothstep(0.55, 1.0, r);
      sclera -= vec3(0.0, 0.10, 0.09) * vein * 0.7;
      float irisR = 0.56;
      float t = r / irisR;
      float streak = 0.5 + 0.5 * sin(az * 26.0 + sin(az * 5.0 + uTime * 0.4) * 2.0);
      vec3 irisCol = mix(uIris * 1.3, uIris * 0.45, smoothstep(0.15, 1.0, t)) * (0.7 + 0.4 * streak);
      irisCol = mix(irisCol, vec3(1.0, 0.85, 0.45), smoothstep(0.55, 0.25, t) * 0.45);
      irisCol *= 1.0 - smoothstep(0.82, 1.0, t) * 0.7;
      float irisM = (1.0 - smoothstep(irisR - 0.02, irisR, r)) * front;
      vec3 col = mix(sclera, irisCol, irisM);
      vec2 pq = vec2(q.x * (1.0 + uSlit * 3.5), q.y);
      float pupM = (1.0 - smoothstep(uPupil - 0.015, uPupil, length(pq))) * front;
      col = mix(col, vec3(0.02, 0.01, 0.05), pupM);
      col += smoothstep(0.1, 0.0, length(q - vec2(0.2, 0.24))) * front * 0.9;
      vec3 L = normalize(vec3(0.3, 0.6, 0.8));
      col *= 0.72 + 0.28 * max(dot(N, L), 0.0);
      float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
      col += fres * (0.35 + uGlow) * vec3(1.0, 0.93, 0.8);
      col += vRip * vec3(1.0);
      gl_FragColor = vec4(col, uOpacity);
    }`;
