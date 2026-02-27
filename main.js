

'use strict';

const API_BASE = localStorage.getItem("SPACEHOUND_API") || "http://127.0.0.1:8000";

(function initReveal() {
  const revealEls = document.querySelectorAll('.reveal');

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('visible'), i * 80);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  revealEls.forEach(el => observer.observe(el));
})();

(function initNavShrink() {
  const nav = document.querySelector('nav');
  window.addEventListener('scroll', () => {
    nav.style.height = window.scrollY > 60 ? '52px' : '64px';
  });
})();

(function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth' });
    });
  });
})();

function toggleFaq(btn) {
  const answer = btn.nextElementSibling;
  const isOpen = btn.classList.contains('open');

  document.querySelectorAll('.faq-q').forEach(b => b.classList.remove('open'));
  document.querySelectorAll('.faq-a').forEach(a => a.classList.remove('open'));

  if (!isOpen) {
    btn.classList.add('open');
    answer.classList.add('open');
  }
}


function switchTab(tab) {
  document.querySelectorAll('.serve-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');

  document.querySelectorAll('[id^="tab-"]').forEach(g => (g.style.display = 'none'));
  const target = document.getElementById('tab-' + tab);
  if (target) target.style.display = 'grid';
}

async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const status = document.getElementById('uploadStatus');
  if (!status) return;

  status.style.display = 'block';
  status.style.color = 'var(--muted)';
  status.textContent = `⏳ Uploading "${file.name}" to AI analyst...`;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/analyze_mission_file`, {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || data.error || "Failed to analyze file");

    status.style.color = 'var(--green)';
    status.textContent = `✅ Analyzed: found Alt ${data.altitude} km, Inc ${data.inclination}°`;

    // Auto-fill the form
    const altInput = document.getElementById('altInput');
    const incInput = document.getElementById('incInput');
    if (altInput && data.altitude) altInput.value = data.altitude;
    if (incInput && data.inclination) incInput.value = data.inclination;

    // Run the risk analysis automatically
    setTimeout(runAnalysis, 500);

  } catch (err) {
    status.style.color = '#ff4d6d';
    status.textContent = `❌ Error: ${err.message}`;
  }
}


function $(id) { return document.getElementById(id); }

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function setHint(html, isError = false) {
  const recsEl = $('orbitRecs');
  if (!recsEl) return;
  recsEl.innerHTML = `<div class="orbit-hint ${isError ? 'error' : ''}">${html}</div>`;
}

function recCard(title, opt) {
  if (!opt) return "";
  return `
    <div class="orbit-card">
      <div class="orbit-card-title">${title}</div>
      <div class="orbit-row"><span>Altitude</span><b>${opt.altitude} km</b></div>
      <div class="orbit-row"><span>Inclination</span><b>${opt.inclination}°</b></div>
      <div class="orbit-row"><span>Risk</span><b>${(Number(opt.risk_score || 0) * 100).toFixed(1)}%</b></div>
      ${opt.note ? `<div class="orbit-note">${opt.note}</div>` : ""}
    </div>
  `;
}

async function callRecommendOrbit(alt, inc) {
  const url = `${API_BASE}/recommend_orbit?altitude=${encodeURIComponent(alt)}&inclination=${encodeURIComponent(inc)}`;
  const res = await fetch(url, { method: "POST", headers: { "accept": "application/json" } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "API error");
  return data;
}

function setScore(riskScoreFloat) {
  const scoreEl = $('riskScore');
  if (!scoreEl) return;

  const pct = clamp(riskScoreFloat * 100, 0, 99.9);
  scoreEl.textContent = `${pct.toFixed(1)}%`;

  if (pct < 10) scoreEl.style.color = "var(--green)";
  else if (pct < 25) scoreEl.style.color = "#f5c842";
  else scoreEl.style.color = "var(--red)";
}

function setBars(riskScoreFloat) {
  const fills = document.querySelectorAll('.score-bar-fill');
  if (!fills || fills.length < 4) return;

  const r = clamp(riskScoreFloat, 0, 1);

  const availability = clamp(100 - r * 100, 0, 100);
  const powerRisk = clamp(r * 70, 0, 100);
  const commRisk = clamp(r * 90, 0, 100);
  const debris = clamp(r * 50, 0, 100);

  const widths = [
    `${availability.toFixed(0)}%`,
    `${powerRisk.toFixed(0)}%`,
    `${commRisk.toFixed(0)}%`,
    `${debris.toFixed(0)}%`,
  ];

  fills.forEach((fill, j) => { fill.style.width = widths[j]; });
}

function setupCanvas(canvas) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;

  const cssW = canvas.clientWidth || 820;
  const cssH = canvas.clientHeight || 220;

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  return { ctx, W: cssW, H: cssH };
}

function lerp(a, b, t) { return a + (b - a) * t; }

function drawChartFrame(ctx, W, H) {

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(15,26,48,0.85)");
  g.addColorStop(1, "rgba(6,10,24,0.95)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.globalAlpha = 0.55;
  const glow = ctx.createRadialGradient(W * 0.25, H * 0.2, 10, W * 0.25, H * 0.2, Math.max(W, H));
  glow.addColorStop(0, "rgba(0,229,255,0.10)");
  glow.addColorStop(1, "rgba(0,229,255,0.0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.strokeStyle = "rgba(0,229,255,0.14)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
}

function drawGrid(ctx, W, H, pad) {
  const { L, R, T, B } = pad;
  ctx.save();
  ctx.strokeStyle = "rgba(0,229,255,0.08)";
  ctx.lineWidth = 1;

  const rows = 4;
  const cols = 6;

  for (let i = 0; i <= rows; i++) {
    const y = T + i * (H - T - B) / rows;
    ctx.beginPath();
    ctx.moveTo(L, y);
    ctx.lineTo(W - R, y);
    ctx.stroke();
  }

  for (let i = 0; i <= cols; i++) {
    const x = L + i * (W - L - R) / cols;
    ctx.beginPath();
    ctx.moveTo(x, T);
    ctx.lineTo(x, H - B);
    ctx.stroke();
  }

  ctx.restore();
}

function drawAxesLabels(ctx, W, H, pad, minX, maxX, minY, maxY) {
  const { L, T, B } = pad;

  ctx.save();
  ctx.fillStyle = "rgba(232,237,248,0.72)";
  ctx.font = "12px system-ui";

  ctx.fillText("Risk vs Altitude (LEO)", L, 18);

  ctx.fillStyle = "rgba(107,122,157,0.95)";
  ctx.font = "11px system-ui";

  ctx.fillText(`${(maxY * 100).toFixed(1)}%`, 8, T + 10);
  ctx.fillText(`${(minY * 100).toFixed(1)}%`, 8, H - B);

  ctx.fillText(`${Math.round(minX)} km`, L, H - 8);
  ctx.fillText(`${Math.round(maxX)} km`, W - 70, H - 8);

  ctx.restore();
}

function chartScales(points, pad, W, H) {
  const xs = points.map(p => p.alt);
  const ys = points.map(p => p.risk);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);

  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  const span = (maxY - minY) || 0.01;
  minY = Math.max(0, minY - span * 0.12);
  maxY = Math.min(1, maxY + span * 0.18);

  const xToPx = (x) => pad.L + (x - minX) / (maxX - minX || 1) * (W - pad.L - pad.R);
  const yToPx = (y) => pad.T + (1 - (y - minY) / (maxY - minY || 1)) * (H - pad.T - pad.B);

  return { minX, maxX, minY, maxY, xToPx, yToPx };
}

function drawLine(ctx, points, scale, t = 1) {
  const { xToPx, yToPx } = scale;

  ctx.save();

  ctx.lineWidth = 2.2;
  ctx.strokeStyle = "rgba(0,229,255,0.95)";
  ctx.shadowBlur = 16;
  ctx.shadowColor = "rgba(0,229,255,0.9)";

  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xToPx(p.alt);
    const y = yToPx(p.risk);
    const yy = lerp((ctx.canvas?.clientHeight || 220) - 28, y, t);
    if (i === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  });
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = "rgba(232,237,248,0.75)";
  ctx.beginPath();
  points.forEach((p, i) => {
    const x = xToPx(p.alt);
    const y = yToPx(p.risk);
    const yy = lerp((ctx.canvas?.clientHeight || 220) - 28, y, t);
    if (i === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  });
  ctx.stroke();

  ctx.restore();
}

function drawPoints(ctx, points, scale, highlightAlt) {
  const { xToPx, yToPx } = scale;

  ctx.save();


  points.forEach(p => {
    const x = xToPx(p.alt);
    const y = yToPx(p.risk);
    ctx.beginPath();
    ctx.arc(x, y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fill();
  });

  const hx = xToPx(highlightAlt);
  ctx.strokeStyle = "rgba(124,58,255,0.85)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(hx, 12);
  ctx.lineTo(hx, (ctx.canvas?.clientHeight || 220) - 28);
  ctx.stroke();

  ctx.fillStyle = "rgba(124,58,255,0.95)";
  ctx.font = "12px system-ui";
  ctx.fillText(`alt ${Math.round(highlightAlt)} km`, Math.min((ctx.canvas?.clientWidth || 820) - 110, hx + 8), 34);

  ctx.restore();
}

let chartAnimHandle = null;
function drawRiskChart(points, highlightAlt) {
  const canvas = $('riskChart');
  if (!canvas) return;

  const { ctx, W, H } = setupCanvas(canvas);
  const pad = { L: 48, R: 18, T: 26, B: 28 };

  const scale = chartScales(points, pad, W, H);

  let start = null;
  const duration = 650;

  if (chartAnimHandle) cancelAnimationFrame(chartAnimHandle);

  function frame(ts) {
    if (!start) start = ts;
    const t = clamp((ts - start) / duration, 0, 1);

    drawChartFrame(ctx, W, H);
    drawGrid(ctx, W, H, pad);
    drawAxesLabels(ctx, W, H, pad, scale.minX, scale.maxX, scale.minY, scale.maxY);


    drawLine(ctx, points, scale, t);

    if (t > 0.85) drawPoints(ctx, points, scale, highlightAlt);

    if (t < 1) chartAnimHandle = requestAnimationFrame(frame);
  }

  chartAnimHandle = requestAnimationFrame(frame);
}

async function runAnalysis() {
  const alt = parseFloat($('altInput')?.value || "");
  const inc = parseFloat($('incInput')?.value || "");
  const launchDate = $('launchDate')?.value || "";
  const missionDays = $('missionDays')?.value || "";

  if (!Number.isFinite(alt) || !Number.isFinite(inc)) {
    setHint("Please enter <b>Altitude</b> and <b>Inclination</b>.", true);
    return;
  }

  setHint("Analyzing orbit… <b>connecting to SpaceHound AI</b> 🚀");

  try {

    const data = await callRecommendOrbit(alt, inc);

    const bestRisk = Number(data?.best_option?.risk_score ?? 0);

    const overallRisk = Number(data?.risk_score ?? bestRisk);
    setScore(overallRisk);
    setBars(overallRisk);

    const pill = $('riskLevelPill');
    if (pill) {
      const lvl = (data?.risk_level || "").toUpperCase() || (overallRisk < 0.12 ? "LOW" : overallRisk < 0.28 ? "MEDIUM" : "HIGH");
      pill.textContent = `RISK: ${lvl}`;
      if (lvl === "LOW") { pill.style.borderColor = "rgba(0,255,160,0.35)"; pill.style.color = "rgba(0,255,160,0.95)"; }
      else if (lvl === "MEDIUM") { pill.style.borderColor = "rgba(245,200,66,0.45)"; pill.style.color = "rgba(245,200,66,0.95)"; }
      else { pill.style.borderColor = "rgba(255,70,70,0.55)"; pill.style.color = "rgba(255,140,140,0.95)"; }
    }

    const reasonsEl = $('riskReasons');
    if (reasonsEl) {
      const reasons = Array.isArray(data?.main_reasons) ? data.main_reasons : [];
      reasonsEl.innerHTML = reasons.length ? reasons.map(r => `<li>${r}</li>`).join("") : "<li>No major risk drivers detected.</li>";
    }

    const recoEl = $('riskRecommendation');
    if (recoEl) {
      recoEl.innerHTML = data?.recommendation_text
        ? `<b>Recommendation:</b> ${data.recommendation_text}`
        : `<b>Recommendation:</b> Keep monitoring conjunctions and reserve maneuver margin, especially during initial deployment.`;
    }


    const recsEl = $('orbitRecs');
    if (recsEl) {
      recsEl.innerHTML = `
        <div class="orbit-hint">
          <b>Mission inputs received:</b><br>
          Altitude: ${alt} km · Inclination: ${inc}°<br>
          Launch date: ${launchDate || "—"} · Duration: ${missionDays ? missionDays + " days" : "—"}
        </div>

        <div class="orbit-grid">
          ${(Array.isArray(data.top_options) && data.top_options.length >= 3)
          ? (recCard("Best option", data.top_options[0]) + recCard("Second option", data.top_options[1]) + recCard("Third option", data.top_options[2]))
          : (recCard("Best option", data.best_option) + recCard("Second option", data.second_option) + recCard("Third option", data.third_option))}
        </div>
      `;
    }

    const offsets = [-60, -40, -20, -10, 0, 10, 20, 40, 60];
    const sampleAlts = offsets.map(o => clamp(alt + o, 150, 2000));

    drawRiskChart(sampleAlts.map(a => ({ alt: a, risk: Number(data?.risk_score ?? bestRisk) })), alt);

    const points = [];
    for (const a of sampleAlts) {
      const d = await callRecommendOrbit(a, inc);
      const r = Number(d?.best_option?.risk_score ?? bestRisk);
      points.push({ alt: a, risk: r });
    }
    points.sort((p1, p2) => p1.alt - p2.alt);

    drawRiskChart(points, alt);


    await renderHeatmap();
    await initOrUpdate3D();

  } catch (err) {
    setHint(`Failed to fetch from AI. <br><span style="opacity:.85">Check that FastAPI is running at ${API_BASE} and open the site via Live Server.</span><br><br><b>Error:</b> ${err.message}`, true);
  }

  async function generatePDF() {
    const alt = document.getElementById('altInput')?.value || 550;
    const inc = document.getElementById('incInput')?.value || 97;
    const launchDate = document.getElementById('launchDate')?.value || "";
    const missionDays = document.getElementById('missionDays')?.value || "";

    const url = `${API_BASE}/report.pdf?altitude=${encodeURIComponent(alt)}&inclination=${encodeURIComponent(inc)}&launch_date=${encodeURIComponent(launchDate)}&mission_days=${encodeURIComponent(missionDays)}`;

    const res = await fetch(url, { method: "POST" });
    if (!res.ok) {
      alert("PDF generation failed. Check backend.");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "spacehound_mission_report.pdf";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }
  window.generatePDF = generatePDF;


  async function renderHeatmap() {
    const canvas = document.getElementById("heatmap");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    const inc = parseFloat(document.getElementById("incInput")?.value || 97);
    const url = `${API_BASE}/risk_curve?inclination=${encodeURIComponent(inc)}&alt_min=200&alt_max=1200&step=10`;
    const res = await fetch(url);
    const data = await res.json();
    const pts = data.points || [];

    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = "rgba(6,10,24,0.95)";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(0,229,255,0.8)";
    ctx.font = "12px system-ui";
    ctx.fillText(`LEO Risk Heatmap  |  inclination=${inc}°`, 14, 18);

    const padL = 54, padR = 20, padT = 34, padB = 34;
    const minAlt = pts[0]?.altitude ?? 200;
    const maxAlt = pts[pts.length - 1]?.altitude ?? 1200;

    ctx.strokeStyle = "rgba(0,229,255,0.08)";
    for (let i = 0; i <= 6; i++) {
      const x = padL + i * (W - padL - padR) / 6;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, H - padB); ctx.stroke();
    }
    for (let i = 0; i <= 4; i++) {
      const y = padT + i * (H - padT - padB) / 4;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    }

    function riskToColor(r) {

      const t = Math.max(0, Math.min(1, r));

      if (t < 0.33) return `rgba(0,229,255,${0.15 + t * 0.6})`;
      if (t < 0.66) return `rgba(245,200,66,${0.15 + (t - 0.33) * 0.9})`;
      return `rgba(255,77,109,${0.15 + (t - 0.66) * 1.2})`;
    }

    const bandH = (H - padT - padB);
    const stepW = (W - padL - padR) / Math.max(1, pts.length);

    pts.forEach((p, i) => {
      const x = padL + i * stepW;
      ctx.fillStyle = riskToColor(p.risk);
      ctx.fillRect(x, padT, stepW + 1, bandH);
    });

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.font = "11px system-ui";
    ctx.fillText(`${minAlt} km`, padL, H - 12);
    ctx.fillText(`${maxAlt} km`, W - 70, H - 12);
  }


  let threeState = null;

  async function initOrUpdate3D() {
    const container = document.getElementById("orbit3D");
    if (!container || !window.THREE) return;

    const alt = parseFloat(document.getElementById("altInput")?.value || 550);
    const inc = parseFloat(document.getElementById("incInput")?.value || 97);

    const dres = await fetch(`${API_BASE}/density?n=900&alt_min=300&alt_max=900`);
    const ddata = await dres.json();
    const points = ddata.points || [];

    if (!threeState) {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 2000);
      camera.position.set(0, 0, 4);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      container.innerHTML = "";
      container.appendChild(renderer.domElement);

      const amb = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(amb);
      const dir = new THREE.DirectionalLight(0xffffff, 0.6);
      dir.position.set(5, 5, 5);
      scene.add(dir);

      const earthGeo = new THREE.SphereGeometry(1, 48, 48);
      const earthMat = new THREE.MeshStandardMaterial({
        color: 0x0b1228,
        emissive: 0x071022,
        roughness: 0.9,
        metalness: 0.1
      });
      const earth = new THREE.Mesh(earthGeo, earthMat);
      scene.add(earth);

      const glowGeo = new THREE.SphereGeometry(1.03, 48, 48);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.08 });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      scene.add(glow);

      const satGroup = new THREE.Group();
      const orbitGroup = new THREE.Group();
      scene.add(satGroup);
      scene.add(orbitGroup);

      let isDown = false, px = 0, py = 0;
      renderer.domElement.addEventListener("mousedown", (e) => { isDown = true; px = e.clientX; py = e.clientY; });
      window.addEventListener("mouseup", () => { isDown = false; });
      window.addEventListener("mousemove", (e) => {
        if (!isDown) return;
        const dx = (e.clientX - px) / 200;
        const dy = (e.clientY - py) / 200;
        px = e.clientX; py = e.clientY;
        scene.rotation.y += dx;
        scene.rotation.x += dy;
      });

      window.addEventListener("resize", () => {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      });

      function loop() {
        earth.rotation.y += 0.0015;
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
      }
      requestAnimationFrame(loop);

      threeState = { scene, camera, renderer, satGroup, orbitGroup, earth };
    }

    const { satGroup, orbitGroup } = threeState;
    while (satGroup.children.length) satGroup.remove(satGroup.children[0]);
    while (orbitGroup.children.length) orbitGroup.remove(orbitGroup.children[0]);


    const R = 1.0;
    const scaleAlt = (a) => 1.0 + (a / 1000) * 0.6;
    const satGeo = new THREE.SphereGeometry(0.008, 10, 10);
    const satMat = new THREE.MeshBasicMaterial({ color: 0x9aa7c7 });

    points.forEach(p => {
      const lat = (p.lat * Math.PI) / 180;
      const lon = (p.lon * Math.PI) / 180;
      const rr = R * scaleAlt(p.altitude);

      const x = rr * Math.cos(lat) * Math.cos(lon);
      const y = rr * Math.sin(lat);
      const z = rr * Math.cos(lat) * Math.sin(lon);

      const m = new THREE.Mesh(satGeo, satMat);
      m.position.set(x, y, z);
      satGroup.add(m);
    });


    const ringRadius = R * scaleAlt(alt);
    const ringGeo = new THREE.RingGeometry(ringRadius - 0.002, ringRadius + 0.002, 256);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x7c3aff, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);

    ring.rotation.x = (Math.PI / 2);
    ring.rotation.z = (inc * Math.PI) / 180;
    orbitGroup.add(ring);
  }

  window.renderHeatmap = renderHeatmap;
  window.initOrUpdate3D = initOrUpdate3D;

}
window.addEventListener("load", async () => {
  try {
    await renderHeatmap();
    await initOrUpdate3D();
  } catch (e) {
    console.error(e);
  }
});


let viewer = null;

function show3DError(container, msg) {
  container.innerHTML = `
    <div style="padding:14px;font-family:system-ui;color:rgba(255,77,109,.95)">
      ❌ 3D Viewer error<br>
      <div style="margin-top:8px;color:rgba(255,255,255,.75)">${msg}</div>
    </div>
  `;
}

async function fetchTLEText(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TLE fetch failed: HTTP ${res.status}`);
  return await res.text();
}

function parseTLE3Lines(text, limit = 150) {

  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length && out.length < limit; i += 3) {
    const name = lines[i];
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (l1.startsWith("1 ") && l2.startsWith("2 ")) out.push({ name, l1, l2 });
  }
  return out;
}

function eciToVec3(eciKm, kmToUnits) {

  return new THREE.Vector3(
    eciKm.x * kmToUnits,
    eciKm.z * kmToUnits,
    eciKm.y * kmToUnits
  );
}

function initViewer(container) {
  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    55,
    container.clientWidth / container.clientHeight,
    0.1,
    5000
  );
  camera.position.set(0, 0, 4);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dir = new THREE.DirectionalLight(0xffffff, 0.7);
  dir.position.set(6, 4, 5);
  scene.add(dir);

  const earth = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 48),
    new THREE.MeshStandardMaterial({
      color: 0x0b1228,
      emissive: 0x061022,
      roughness: 0.9,
      metalness: 0.1,
    })
  );
  scene.add(earth);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.03, 48, 48),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.07 })
  );
  scene.add(glow);

  const sats = new THREE.Group();
  scene.add(sats);

  let isDown = false, px = 0, py = 0;
  renderer.domElement.addEventListener("mousedown", (e) => {
    isDown = true; px = e.clientX; py = e.clientY;
  });
  window.addEventListener("mouseup", () => { isDown = false; });
  window.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    const dx = (e.clientX - px) / 220;
    const dy = (e.clientY - py) / 220;
    px = e.clientX; py = e.clientY;
    scene.rotation.y += dx;
    scene.rotation.x += dy;
  });

  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  function loop() {
    earth.rotation.y += 0.0012;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  return { scene, camera, renderer, sats };
}

'use strict';


const TLE_PRIMARY = "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle";
const TLE_FALLBACK_LOCAL = "./tle_fallback.txt";

let state = {
  scene: null,
  camera: null,
  renderer: null,
  earth: null,
  satsPoints: null,
  satsGeom: null,
  satsPositions: null,
  satList: [],
  orbitLine: null,
  highlight: null,
  statusEl: null,
  lastSelected: null,
  kmToUnits: 1 / 6371,
  maxSats: 350,
};

function $(id) { return document.getElementById(id); }

function ensureStatus(container) {
  let el = container.querySelector(".viz-status");
  if (!el) {
    el = document.createElement("div");
    el.className = "viz-status";
    el.style.cssText = `
      position:absolute; left:12px; top:12px;
      padding:10px 12px; border-radius:12px;
      background:rgba(6,10,24,.72);
      border:1px solid rgba(255,255,255,.08);
      color:rgba(255,255,255,.82);
      font: 12px system-ui;
      backdrop-filter: blur(10px);
      z-index: 5;
      max-width: 75%;
      pointer-events:none;
      line-height:1.35;
    `;
    container.style.position = "relative";
    container.appendChild(el);
  }
  state.statusEl = el;
}
function setStatus(html) {
  if (state.statusEl) state.statusEl.innerHTML = html;
}

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function parseTLE(text, limit = 350) {
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length && out.length < limit; i += 3) {
    const name = lines[i];
    const l1 = lines[i + 1];
    const l2 = lines[i + 2];
    if (!l1.startsWith("1 ") || !l2.startsWith("2 ")) continue;
    const id = l1.substring(2, 7).trim();
    out.push({ name, id, l1, l2 });
  }
  return out;
}

function init3D(container) {
  if (!window.THREE) {
    container.innerHTML = "❌ THREE.js not loaded";
    return false;
  }
  if (!window.satellite) {
    container.innerHTML = "❌ satellite.js not loaded";
    return false;
  }

  ensureStatus(container);
  setStatus("Loading 3D scene…");

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    5000
  );
  camera.position.set(0, 0, 4.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  ensureStatus(container);

  scene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const dir = new THREE.DirectionalLight(0xffffff, 0.65);
  dir.position.set(6, 3, 5);
  scene.add(dir);

  const earthGeom = new THREE.SphereGeometry(1, 96, 96);
  const earthMat = new THREE.MeshStandardMaterial({
    color: 0x0b1228,
    emissive: 0x061022,
    roughness: 0.95,
    metalness: 0.05
  });
  const earth = new THREE.Mesh(earthGeom, earthMat);
  scene.add(earth);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(1.03, 96, 96),
    new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.06 })
  );
  scene.add(glow);

  const starCount = 900;
  const starGeom = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 80 + Math.random() * 120;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    starPos[i * 3 + 0] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeom.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = new THREE.PointsMaterial({ size: 0.9, sizeAttenuation: false, color: 0xffffff, transparent: true, opacity: 0.35 });
  const stars = new THREE.Points(starGeom, starMat);
  scene.add(stars);

  const highlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.03, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff4d6d })
  );
  highlight.visible = false;
  scene.add(highlight);

  let orbitLine = null;

  let isDown = false, px = 0, py = 0;
  renderer.domElement.addEventListener("mousedown", (e) => { isDown = true; px = e.clientX; py = e.clientY; });
  window.addEventListener("mouseup", () => { isDown = false; });
  window.addEventListener("mousemove", (e) => {
    if (!isDown) return;
    const dx = (e.clientX - px) / 220;
    const dy = (e.clientY - py) / 220;
    px = e.clientX; py = e.clientY;
    scene.rotation.y += dx;
    scene.rotation.x += dy;
  });

  window.addEventListener("resize", () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  function loop() {
    earth.rotation.y += 0.0012;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  state.scene = scene;
  state.camera = camera;
  state.renderer = renderer;
  state.earth = earth;
  state.highlight = highlight;
  state.orbitLine = orbitLine;

  try {
    const loader = new THREE.TextureLoader();
    loader.load(
      "https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg",
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        earth.material.map = tex;
        earth.material.needsUpdate = true;
        setStatus("Earth texture loaded ✅<br>Loading satellites…");
      },
      undefined,
      () => { }
    );
  } catch (_) { }

  return true;
}

function buildSatPoints(count) {
  const geom = new THREE.BufferGeometry();
  const arr = new Float32Array(count * 3);
  geom.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  geom.computeBoundingSphere();

  const mat = new THREE.PointsMaterial({
    size: 3.0,
    sizeAttenuation: false,
    color: 0x9aa7c7,
    transparent: true,
    opacity: 0.85
  });

  const pts = new THREE.Points(geom, mat);
  state.scene.add(pts);

  state.satsPoints = pts;
  state.satsGeom = geom;
  state.satsPositions = arr;
}

function geoToXYZ(lat, lon, heightKm) {
  const R = 6371;
  const r = (R + heightKm) * state.kmToUnits;
  const x = r * Math.cos(lat) * Math.cos(lon);
  const y = r * Math.sin(lat);
  const z = r * Math.cos(lat) * Math.sin(lon);
  return { x, y, z };
}

function updateSatPositions() {
  const now = new Date();

  for (let i = 0; i < state.satList.length; i++) {
    const s = state.satList[i];
    const pv = satellite.propagate(s.satrec, now);
    if (!pv.position) {
      state.satsPositions[i * 3 + 0] = 999;
      state.satsPositions[i * 3 + 1] = 999;
      state.satsPositions[i * 3 + 2] = 999;
      continue;
    }
    const gmst = satellite.gstime(now);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    const p = geoToXYZ(geo.latitude, geo.longitude, geo.height);

    state.satsPositions[i * 3 + 0] = p.x;
    state.satsPositions[i * 3 + 1] = p.y;
    state.satsPositions[i * 3 + 2] = p.z;

    s.lastPos = p;
  }

  state.satsGeom.attributes.position.needsUpdate = true;
}

function drawOrbitTrack(noradId) {
  const s = state.satList.find(x => x.id === String(noradId));
  if (!s) return;

  if (state.orbitLine) {
    state.scene.remove(state.orbitLine);
    state.orbitLine.geometry.dispose();
    state.orbitLine.material.dispose();
    state.orbitLine = null;
  }

  const now = new Date();
  const pts = [];
  for (let t = 0; t <= 90 * 60; t += 60) {
    const dt = new Date(now.getTime() + t * 1000);
    const pv = satellite.propagate(s.satrec, dt);
    if (!pv.position) continue;
    const gmst = satellite.gstime(dt);
    const geo = satellite.eciToGeodetic(pv.position, gmst);
    const p = geoToXYZ(geo.latitude, geo.longitude, geo.height);
    pts.push(new THREE.Vector3(p.x, p.y, p.z));
  }

  const geoLine = new THREE.BufferGeometry().setFromPoints(pts);
  const matLine = new THREE.LineBasicMaterial({ color: 0x7c3aff, transparent: true, opacity: 0.85 });
  const line = new THREE.Line(geoLine, matLine);

  state.scene.add(line);
  state.orbitLine = line;
}

function highlightSatelliteById() {
  const input = $("noradSearch");
  if (!input) return;
  const id = input.value.trim();
  const s = state.satList.find(x => x.id === id);
  if (!s || !s.lastPos) {
    setStatus(`Satellites loaded: <b>${state.satList.length}</b><br>❌ NORAD ${id} not found (or not propagated yet)`);
    return;
  }

  state.highlight.position.set(s.lastPos.x, s.lastPos.y, s.lastPos.z);
  state.highlight.visible = true;
  state.lastSelected = id;

  drawOrbitTrack(id);

  setStatus(
    `Satellites loaded: <b>${state.satList.length}</b><br>` +
    `Selected: <b>${s.name}</b> (NORAD ${id})<br>` +
    `Orbit track: <b>90 min</b>`
  );
}
window.highlightSatellite = highlightSatelliteById;

async function loadSatellites() {
  setStatus("Fetching TLE (CelesTrak)…");

  let text = null;
  let source = "CelesTrak";

  try {
    text = await fetchText(TLE_PRIMARY);
  } catch (e) {
    source = "local fallback";
    try {
      text = await fetchText(TLE_FALLBACK_LOCAL);
    } catch (_) {
      text = null;
    }
  }

  if (!text) {
    setStatus(
      "❌ Cannot load TLE.<br>" +
      "Чаще всего это CORS/blocked.<br>" +
      "Решение: добавь файл <b>frontend/tle_fallback.txt</b> (TLE) и перезагрузи страницу."
    );
    return;
  }

  const list = parseTLE(text, state.maxSats);

  if (!list.length) {
    setStatus(`❌ TLE parsed empty from ${source}.`);
    return;
  }

  state.satList = list.map((t, idx) => ({
    ...t,
    idx,
    satrec: satellite.twoline2satrec(t.l1, t.l2),
    lastPos: null
  }));

  buildSatPoints(state.satList.length);

  setStatus(
    `TLE source: <b>${source}</b><br>` +
    `Satellites loaded: <b>${state.satList.length}</b><br>` +
    `Tip: type <b>25544</b> and press Find`
  );

  updateSatPositions();
  setInterval(updateSatPositions, 1200);
}

async function start() {
  const container = $("orbit3D");
  if (!container) return;

  if (!init3D(container)) return;

  await loadSatellites();
}

window.addEventListener("load", start);


window.toggleFaq = toggleFaq;
window.switchTab = switchTab;
window.simulateUpload = simulateUpload;
window.runAnalysis = runAnalysis;