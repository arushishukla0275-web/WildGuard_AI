(() => {
  "use strict";

  const RISK_COLORS = {
    LOW: "#5b8a5a",
    MODERATE: "#ffb627",
    HIGH: "#ff6b35",
    EXTREME: "#e0342a",
  };
  const CIRC = 2 * Math.PI * 86;

  const $ = (id) => document.getElementById(id);

  const state = {
    lat: 21.25,
    lon: 81.63,
    place: "Chhattisgarh, India",
    liveWeather: false,
    lastResult: null,
    autoRefreshTimer: null,
  };

  // ================= STEP NAVIGATION =================
  const steps = [1, 2, 3, 4];
  let currentStep = 1;

  function goToStep(n) {
    steps.forEach((s) => {
      const panel = document.querySelector(`[data-step-panel="${s}"]`);
      panel.hidden = s !== n;
    });
    document.querySelectorAll(".step-dot").forEach((dot) => {
      const s = Number(dot.dataset.step);
      dot.classList.toggle("active", s === n);
      dot.classList.toggle("done", s < n);
    });
    currentStep = n;
    if (n === 3) {
      setTimeout(() => mapResult.invalidateSize(), 60);
    }
    if (n === 1) {
      setTimeout(() => mapPick.invalidateSize(), 60);
    }
    window.scrollTo({ top: document.querySelector(".stepper").offsetTop - 20, behavior: "smooth" });
  }

  document.querySelectorAll("[data-goto]").forEach((btn) => {
    btn.addEventListener("click", () => goToStep(Number(btn.dataset.goto)));
  });
  document.querySelectorAll(".step-dot").forEach((dot) => {
    dot.addEventListener("click", () => {
      const target = Number(dot.dataset.step);
      // only allow jumping to a step that's already been reached, or the very next one
      if (target <= currentStep || (target === 3 && state.lastResult) || target <=4) goToStep(target);
    });
  });

  // ================= SLIDERS =================
  const tempEl = $("temp"), humidityEl = $("humidity"), windEl = $("wind"), ndviEl = $("ndvi");
  const tempOut = $("tempOut"), humidityOut = $("humidityOut"), windOut = $("windOut"), ndviOut = $("ndviOut");

  function syncSliderLabel(input, output, decimals) {
    const fmt = (v) => (decimals === 0 ? Math.round(v) : Number(v).toFixed(decimals));
    output.textContent = fmt(input.value);
    input.addEventListener("input", () => {
      output.textContent = fmt(input.value);
      state.liveWeather = false;
      $("liveStatus").textContent = "Manual input — conditions not synced to live weather.";
      $("liveStatus").classList.remove("live");
    });
  }
  syncSliderLabel(tempEl, tempOut, 1);
  syncSliderLabel(humidityEl, humidityOut, 0);
  syncSliderLabel(windEl, windOut, 1);
  syncSliderLabel(ndviEl, ndviOut, 2);

  // ================= MAPS =================
  const latOut = $("latOut"), lonOut = $("lonOut"), placeOut = $("placeOut");

  const targetIcon = () =>
    L.divIcon({
      className: "",
      html: '<div style="width:16px;height:16px;border-radius:50%;background:#f1ede6;box-shadow:0 0 0 6px rgba(241,237,230,.22);"></div>',
      iconSize: [16, 16],
    });
  const hotspotIcon = () =>
    L.divIcon({
      className: "",
      html: '<div style="width:11px;height:11px;border-radius:50%;background:#ff6b35;box-shadow:0 0 0 5px rgba(255,107,53,.28);"></div>',
      iconSize: [11, 11],
    });

  const mapPick = L.map("mapPick", { zoomControl: true, attributionControl: false }).setView([state.lat, state.lon], 7);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19 }).addTo(mapPick);
  let pickMarker = L.marker([state.lat, state.lon], { icon: targetIcon() }).addTo(mapPick);

  const mapResult = L.map("mapResult", { zoomControl: true, attributionControl: false }).setView([state.lat, state.lon], 7);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", { subdomains: "abcd", maxZoom: 19 }).addTo(mapResult);
  let resultMarker = L.marker([state.lat, state.lon], { icon: targetIcon() }).addTo(mapResult);
  let hotspotLayer = L.layerGroup().addTo(mapResult);

  mapPick.on("click", (e) => {
    setLocation(e.latlng.lat, e.latlng.lng, null, 9);
    reverseGeocode(e.latlng.lat, e.latlng.lng);
  });

  function setLocation(lat, lon, placeName, zoom) {
    state.lat = lat;
    state.lon = lon;
    latOut.textContent = lat.toFixed(4);
    lonOut.textContent = lon.toFixed(4);
    pickMarker.setLatLng([lat, lon]);
    resultMarker.setLatLng([lat, lon]);
    mapPick.flyTo([lat, lon], zoom || mapPick.getZoom(), { duration: 0.8 });
    mapResult.setView([lat, lon], zoom || mapResult.getZoom());
    if (placeName) {
      state.place = placeName;
      placeOut.textContent = placeName;
    }
    // any move invalidates a synced live-weather reading
    state.liveWeather = false;
    $("liveStatus").textContent = "Manual input — conditions not synced to live weather.";
    $("liveStatus").classList.remove("live");
  }

  function renderHotspots(points) {
    hotspotLayer.clearLayers();
    points.forEach((p) => {
      L.marker([p.lat, p.lon], { icon: hotspotIcon() })
        .bindPopup(
          `<div style="font-family:'JetBrains Mono',monospace;font-size:12px;"><b>${p.brightness.toFixed(1)} K</b><br>${p.time}</div>`
        )
        .addTo(hotspotLayer);
    });
  }

  // ================= GEOCODING =================
  let searchTimer = null;
  const locSearch = $("locSearch"), suggestList = $("suggestList");

  locSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = locSearch.value.trim();
    if (q.length < 3) { suggestList.hidden = true; return; }
    searchTimer = setTimeout(() => runGeocode(q), 400);
  });

  async function runGeocode(q) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`);
      const results = await res.json();
      if (!results.length) { suggestList.hidden = true; return; }
      suggestList.innerHTML = "";
      results.forEach((r) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = r.display_name;
        btn.addEventListener("click", () => {
          locSearch.value = r.display_name.split(",")[0];
          suggestList.hidden = true;
          setLocation(parseFloat(r.lat), parseFloat(r.lon), r.display_name, 9);
        });
        suggestList.appendChild(btn);
      });
      suggestList.hidden = false;
    } catch (e) { suggestList.hidden = true; }
  }
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".field-search")) suggestList.hidden = true;
  });

  async function reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
      const r = await res.json();
      const name = r.display_name ? r.display_name.split(",").slice(0, 3).join(",") : `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
      state.place = name;
      placeOut.textContent = name;
      locSearch.value = "";
    } catch (e) {
      placeOut.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    }
  }

  $("geoBtn").addEventListener("click", () => {
    if (!navigator.geolocation) return;
    const btn = $("geoBtn");
    btn.textContent = "📍 Locating…";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation(pos.coords.latitude, pos.coords.longitude, null, 11);
        reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        btn.textContent = "📍 Use my location";
      },
      () => { btn.textContent = "📍 Use my location"; },
      { timeout: 8000 }
    );
  });

  // ================= LIVE WEATHER (Open-Meteo, no key required) =================
  $("liveWeatherBtn").addEventListener("click", async () => {
    const btn = $("liveWeatherBtn");
    const statusEl = $("liveStatus");
    btn.classList.add("loading");
    statusEl.textContent = "Fetching current conditions…";
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${state.lat}&longitude=${state.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m`;
      const res = await fetch(url);
      const data = await res.json();
      const c = data.current;
      tempEl.value = c.temperature_2m;
      humidityEl.value = c.relative_humidity_2m;
      windEl.value = c.wind_speed_10m;
      tempOut.textContent = Number(c.temperature_2m).toFixed(1);
      humidityOut.textContent = Math.round(c.relative_humidity_2m);
      windOut.textContent = Number(c.wind_speed_10m).toFixed(1);
      state.liveWeather = true;
      const t = new Date(c.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      statusEl.textContent = `Live as of ${t} — temperature, humidity & wind synced from Open-Meteo.`;
      statusEl.classList.add("live");
    } catch (e) {
      statusEl.textContent = "Couldn't reach the live weather feed — showing manual values.";
      statusEl.classList.remove("live");
    } finally {
      btn.classList.remove("loading");
    }
  });

  // ================= GAUGE =================
  const gaugeEl = $("gauge"), gaugeFill = $("gaugeFill"), gaugeValue = $("gaugeValue"), gaugeRisk = $("gaugeRisk");
  gaugeFill.style.strokeDasharray = `${CIRC}`;
  gaugeFill.style.strokeDashoffset = `${CIRC}`;

  function setGauge(pct, riskLevel) {
    const offset = CIRC * (1 - Math.min(100, Math.max(0, pct)) / 100);
    gaugeFill.style.stroke = RISK_COLORS[riskLevel] || RISK_COLORS.LOW;
    requestAnimationFrame(() => { gaugeFill.style.strokeDashoffset = `${offset}`; });
    gaugeValue.childNodes[0].nodeValue = `${Math.round(pct)}`;
    gaugeRisk.textContent = riskLevel;
    gaugeEl.dataset.risk = riskLevel;
  }

  // ================= CHARTS =================
  Chart.defaults.font.family = "Inter, sans-serif";
  Chart.defaults.color = "#9c968d";
  Chart.defaults.borderColor = "rgba(241,237,230,.08)";
  const gridOpts = { grid: { color: "rgba(241,237,230,.07)" }, ticks: { font: { size: 10 } } };

  let lineChart, barChart, pieChart, scatterChart;

  function buildCharts(graphs, riskColor) {
    const lineCtx = $("lineChart").getContext("2d");
    const barCtx = $("barChart").getContext("2d");
    const pieCtx = $("pieChart").getContext("2d");
    const scatterCtx = $("scatterChart").getContext("2d");

    [lineChart, barChart, pieChart, scatterChart].forEach((c) => c && c.destroy());

    const gradient = lineCtx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, riskColor + "55");
    gradient.addColorStop(1, riskColor + "00");

    lineChart = new Chart(lineCtx, {
      type: "line",
      data: { labels: graphs.line.labels, datasets: [{ data: graphs.line.values, borderColor: riskColor, backgroundColor: gradient, fill: true, tension: 0.4, pointRadius: 0, borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: gridOpts, y: gridOpts }, animation: { duration: 500 } },
    });

    barChart = new Chart(barCtx, {
      type: "bar",
      data: { labels: graphs.bar.labels, datasets: [{ data: graphs.bar.values, backgroundColor: ["#ff6b35", "#ffb627", "#5b8a5a", "#e0342a"], borderRadius: 6, maxBarThickness: 28 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ...gridOpts, ticks: { ...gridOpts.ticks, font: { size: 9 } } }, y: gridOpts }, animation: { duration: 500 } },
    });

    pieChart = new Chart(pieCtx, {
      type: "doughnut",
      data: { labels: graphs.pie.labels, datasets: [{ data: graphs.pie.values, backgroundColor: ["#ff6b35", "#ffb627", "#5b8a5a", "#e0342a"], borderColor: "#1d1815", borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", labels: { boxWidth: 8, font: { size: 10 }, padding: 10 } } }, animation: { duration: 500 } },
    });

    scatterChart = new Chart(scatterCtx, {
      type: "bubble",
      data: { datasets: [{ data: graphs.scatter.map((d) => ({ x: d.x, y: d.y, r: d.r })), backgroundColor: riskColor + "99", borderColor: riskColor }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { ...gridOpts, min: -0.4, max: 0.4 }, y: { ...gridOpts, min: -0.4, max: 0.4 } }, animation: { duration: 500 } },
    });
  }

  function renderOps(items) {
    const list = $("opsList");
    list.innerHTML = "";
    items.forEach((text) => {
      const li = document.createElement("li");
      li.textContent = text;
      list.appendChild(li);
    });
  }

  // ================= FORECAST OUTLOOK (next 48h + 7 days) =================
  function classifyRisk(fti) {
    if (fti >= 40) return "EXTREME";
    if (fti >= 20) return "HIGH";
    if (fti >= 10) return "MODERATE";
    return "LOW";
  }

  let forecastHourlyChart;

  async function loadForecast() {
    const statusEl = $("forecastStatus");
    statusEl.textContent = "Loading the 7-day weather outlook for this spot…";
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${state.lat}&longitude=${state.lon}&hourly=temperature_2m,relative_humidity_2m,wind_speed_10m&forecast_days=7&timezone=auto`;
      const res = await fetch(url);
      const data = await res.json();
      const times = data.hourly.time;
      const temps = data.hourly.temperature_2m;
      const hums = data.hourly.relative_humidity_2m;
      const winds = data.hourly.wind_speed_10m;

      // --- next 48 hours ---
      const hourCount = Math.min(48, times.length);
      const hourLabels = [];
      const hourFti = [];
      for (let i = 0; i < hourCount; i++) {
        const t = new Date(times[i]);
        hourLabels.push(t.toLocaleTimeString([], { hour: "2-digit" }).replace(":00", "") + (t.getHours() === 0 ? " " + t.toLocaleDateString([], { weekday: "short" }) : ""));
        const safeRh = Math.max(hums[i], 1);
        hourFti.push(Math.round((temps[i] * winds[i]) / safeRh * 10) / 10);
      }
      renderForecastHourly(hourLabels, hourFti);

      // --- group into 7 days, take the worst (peak) hour of each day ---
      const days = {};
      times.forEach((iso, i) => {
        const d = new Date(iso);
        const key = d.toDateString();
        const safeRh = Math.max(hums[i], 1);
        const fti = (temps[i] * winds[i]) / safeRh;
        if (!days[key] || fti > days[key].fti) {
          days[key] = { date: d, fti, temp: temps[i], hum: hums[i], wind: winds[i] };
        }
      });
      const dayList = Object.values(days).slice(0, 7);
      state.forecastDays = dayList;
      renderDayStrip(dayList);

      statusEl.textContent = "Live 7-day outlook from Open-Meteo, updated with this run.";
    } catch (e) {
      statusEl.textContent = "Couldn't reach the forecast feed — outlook unavailable right now.";
    }
  }

  function renderForecastHourly(labels, values) {
    const ctx = $("forecastHourlyChart").getContext("2d");
    if (forecastHourlyChart) forecastHourlyChart.destroy();
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, "#ff6b3555");
    gradient.addColorStop(1, "#ff6b3500");
    forecastHourlyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [{ data: values, borderColor: "#ff6b35", backgroundColor: gradient, fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: "rgba(241,237,230,.06)" }, ticks: { font: { size: 9 }, maxTicksLimit: 12 } },
          y: { grid: { color: "rgba(241,237,230,.06)" }, ticks: { font: { size: 9 } } },
        },
        animation: { duration: 400 },
      },
    });
  }

  function renderDayStrip(days) {
    const strip = $("dayStrip");
    strip.innerHTML = "";
    days.forEach((d, i) => {
      const risk = classifyRisk(d.fti);
      const chip = document.createElement("div");
      chip.className = `day-chip risk-${risk}`;
      const label = i === 0 ? "Today" : d.date.toLocaleDateString([], { weekday: "short" });
      chip.innerHTML = `
        <span class="day-chip-name">${label}</span>
        <span class="day-chip-badge">${risk}</span>
        <span class="day-chip-temp">${Math.round(d.temp)}°C</span>
        <span class="day-chip-meta">${Math.round(d.wind)} km/h · ${Math.round(d.hum)}% RH</span>
      `;
      strip.appendChild(chip);
    });
  }

  // ================= RUN ANALYSIS =================
  const runBtn = $("runBtn");

  async function runAnalysis({ silent = false } = {}) {
    if (!silent) runBtn.classList.add("loading");
    $("statusPillText").textContent = "ANALYZING…";
    try {
      const payload = {
        lat: state.lat,
        lon: state.lon,
        temp: parseFloat(tempEl.value),
        humidity: parseFloat(humidityEl.value),
        wind_speed: parseFloat(windEl.value),
        ndvi: parseFloat(ndviEl.value),
      };
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Request failed");
      const data = await res.json();
      state.lastResult = data;

      const riskColor = RISK_COLORS[data.risk_level] || RISK_COLORS.LOW;
      setGauge(data.threat_percentage, data.risk_level);
      $("statHotspots").textContent = data.nasa_hotspots_count;
      $("statPeak").textContent = data.peak_time_window;
      $("statPlace").textContent = state.place.split(",")[0];

      buildCharts(data.graphs, riskColor);
      renderHotspots(data.nasa_hotspots);
      renderOps(data.precautions);
      loadForecast();

      $("statusPillText").textContent = data.risk_level + " RISK";
      const now = new Date();
      $("lastUpdated").textContent = `Last updated ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;

      if (!silent) goToStep(3);
    } catch (err) {
      renderOps(["⚠️ Could not reach the analysis service. Check your connection and try again."]);
      $("statusPillText").textContent = "ERROR";
    } finally {
      runBtn.classList.remove("loading");
    }
  }
  runBtn.addEventListener("click", () => runAnalysis());

  // ================= LIVE AUTO-REFRESH =================
  const autoToggle = $("autoRefreshToggle");
  autoToggle.addEventListener("change", () => {
    if (autoToggle.checked) {
      $("lastUpdated").textContent = "Auto-refresh on — next update in 5:00";
      state.autoRefreshTimer = setInterval(async () => {
        if (state.liveWeather) {
          try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${state.lat}&longitude=${state.lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m`;
            const res = await fetch(url);
            const d = await res.json();
            tempEl.value = d.current.temperature_2m;
            humidityEl.value = d.current.relative_humidity_2m;
            windEl.value = d.current.wind_speed_10m;
            tempOut.textContent = Number(d.current.temperature_2m).toFixed(1);
            humidityOut.textContent = Math.round(d.current.relative_humidity_2m);
            windOut.textContent = Number(d.current.wind_speed_10m).toFixed(1);
          } catch (e) { /* keep previous values */ }
        }
        runAnalysis({ silent: true });
      }, 5 * 60 * 1000);
    } else {
      clearInterval(state.autoRefreshTimer);
      $("lastUpdated").textContent = "Auto-refresh off";
    }
  });

  // ================= PDF REPORT =================
  $("downloadBtn").addEventListener("click", () => {
    const data = state.lastResult;
    if (!data) { alert("Run an analysis first."); return; }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 40;
    let y = 50;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("WildGuard AI — Wildfire Risk Report", margin, y);
    y += 22;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(`Generated ${new Date().toLocaleString()}`, margin, y);
    y += 26;
    doc.setTextColor(20);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Location", margin, y); y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
    doc.text(`${state.place}`, margin, y); y += 14;
    doc.text(`Lat ${state.lat.toFixed(4)}, Lon ${state.lon.toFixed(4)}`, margin, y); y += 24;

    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Risk Summary", margin, y); y += 18;
    doc.setFontSize(16);
    doc.text(`${data.risk_level}  —  ${data.threat_percentage}% threat`, margin, y); y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
    doc.text(`Peak danger window: ${data.peak_time_window}`, margin, y); y += 14;
    doc.text(`Active satellite hotspots within 400 km: ${data.nasa_hotspots_count}`, margin, y); y += 24;

    doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Input Conditions", margin, y); y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
    doc.text(`Temperature: ${tempEl.value} °C     Humidity: ${humidityEl.value}%`, margin, y); y += 14;
    doc.text(`Wind speed: ${windEl.value} km/h     Vegetation moisture (NDVI): ${ndviEl.value}`, margin, y); y += 24;

    if (state.forecastDays && state.forecastDays.length) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text("7-Day Outlook (worst hour per day)", margin, y); y += 18;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      state.forecastDays.forEach((d, i) => {
        const risk = classifyRisk(d.fti);
        const label = i === 0 ? "Today" : d.date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
        doc.text(`${label.padEnd(14)}  ${risk.padEnd(9)}  ${Math.round(d.temp)}°C  ${Math.round(d.wind)} km/h  ${Math.round(d.hum)}% RH`, margin, y);
        y += 13;
      });
      y += 14;
    }

    // charts as images
    const chartImgs = [
      { chart: lineChart, label: "24-Hour Risk Curve" },
      { chart: barChart, label: "Contributing Factors" },
    ];
    chartImgs.forEach(({ chart, label }) => {
      if (y > 620) { doc.addPage(); y = 50; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(11);
      doc.text(label, margin, y); y += 10;
      const imgData = chart.toBase64Image();
      const w = pageW - margin * 2;
      const h = w * 0.4;
      doc.addImage(imgData, "PNG", margin, y, w, h);
      y += h + 20;
    });

    doc.addPage(); y = 50;
    doc.setFont("helvetica", "bold"); doc.setFontSize(14);
    doc.text("Field Operations Checklist", margin, y); y += 22;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
    data.precautions.forEach((p) => {
      const clean = p.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "").trim();
      const lines = doc.splitTextToSize(`•  ${clean}`, pageW - margin * 2);
      if (y + lines.length * 14 > 780) { doc.addPage(); y = 50; }
      doc.text(lines, margin, y);
      y += lines.length * 14 + 8;
    });

    y += 10;
    doc.setFontSize(8.5); doc.setTextColor(130);
    doc.text("Decision-support estimate only — not a substitute for official fire agency guidance.", margin, 810);

    doc.save(`wildguard-report-${state.lat.toFixed(2)}_${state.lon.toFixed(2)}.pdf`);
  });

  // ================= RESTART =================
  $("restartBtn").addEventListener("click", () => {
    clearInterval(state.autoRefreshTimer);
    autoToggle.checked = false;
    $("lastUpdated").textContent = "Not started";
    goToStep(1);
  });

  // initial silent pass so step 3 isn't empty if user skips ahead
  runAnalysis({ silent: true });
})();
