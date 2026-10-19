"use strict";
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const escapeHtml = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const e = escapeHtml;
const number = (v, digits = 0) =>
  Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: digits });
const shortDate = (value) =>
  value
    ? new Date(value.slice(0, 10) + "T00:00:00+07:00").toLocaleDateString(
        "th-TH",
        {
          day: "numeric",
          month: "short",
          year: "2-digit",
          timeZone: "Asia/Bangkok",
        },
      )
    : "—";
const timestamp = (v) =>
  v
    ? new Date(v).toLocaleString("th-TH", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Bangkok",
      })
    : "—";
const state = {
  view: "dashboard",
  page: 1,
  pageSize: 20,
  fields: [],
  rows: [],
  attention: [],
  meta: null,
  preview: null,
  sequence: 0,
  dash: null,
  history: [],
};
const dateNames = {
  eta: "ETA · กำหนดถึง",
  ata: "ATA · ถึงจริง",
  plan: "กำหนดส่งมอบ",
  delivered: "ส่งมอบจริง",
  received_first: "รับเอกสารครั้งแรก",
  received_latest: "รับเอกสารแก้ไขล่าสุด",
  complete: "เอกสารครบ",
  customs: "ศุลกากร 0209",
  release: "ปล่อยสินค้า 0309",
  do_release: "DO Release",
  file_date: "วันที่ไฟล์",
};
const names = {
  job: "เลข Job",
  invoice: "Invoice No",
  container: "หมายเลขตู้",
  container_count: "จำนวนตู้ (จากไฟล์)",
  carrier: "สายเรือ",
  origin: "ท่าเรือต้นทาง",
  port: "ท่าปล่อยสินค้า",
  size: "ขนาดตู้",
  seal: "Seal",
  cartons: "Cartons · ยอดต่อ Job",
  cbm: "CBM · ยอดต่อ Job",
  issue: "เหตุผลแก้ไขเอกสาร",
  place: "ปลายทาง",
  po: "PO No",
  ...dateNames,
};

async function api(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) {
    let message = "ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่";
    try {
      const body = await response.json();
      message = typeof body.detail === "string" ? body.detail : message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}
let toastTimer;
function toast(message, error = false) {
  $("#toast").textContent = message;
  $("#toast").className = "toast" + (error ? " error" : "");
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => ($("#toast").hidden = true),
    error ? 7000 : 4500,
  );
}
function banner(message = "") {
  $("#error-banner").textContent = message;
  $("#error-banner").hidden = !message;
}
function params() {
  const p = new URLSearchParams();
  if ($("#search").value.trim()) p.set("q", $("#search").value.trim());
  p.set("date_field", $("#date-field").value || "eta");
  if ($("#date-from").value) p.set("from", $("#date-from").value);
  if ($("#date-to").value) p.set("to", $("#date-to").value);
  if ($("#filter-carrier").value)
    p.set("f_carrier", $("#filter-carrier").value);
  if ($("#filter-status").value) p.set("status", $("#filter-status").value);
  $$("#advanced-fields input").forEach((input) => {
    if (input.value.trim())
      p.set("f_" + input.dataset.field, input.value.trim());
  });
  return p;
}
function status(r) {
  const today =
    state.dash?.as_of ||
    new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  if (r.delivered)
    return r.plan && r.delivered.slice(0, 10) > r.plan.slice(0, 10)
      ? ["late", "ส่งล่าช้า"]
      : ["done", "ส่งมอบแล้ว"];
  return r.plan && r.plan.slice(0, 10) < today
    ? ["late", "เกินกำหนด"]
    : ["wait", "รอส่งมอบ"];
}
const badge = (r) => {
  const [cls, text] = status(r);
  return `<span class="badge ${cls}">${text}</span>`;
};
async function loadMeta() {
  const data = await api("/api/meta");
  state.meta = data;
  state.fields = data.fields;
  $("#nav-count").textContent = number(data.total);
  const prev = $("#filter-carrier").value;
  $("#filter-carrier").innerHTML =
    '<option value="">ทั้งหมด</option>' +
    data.options.carrier
      .map((v) => `<option value="${e(v)}">${e(v)}</option>`)
      .join("");
  if (data.options.carrier.includes(prev)) $("#filter-carrier").value = prev;
  const saved = Object.fromEntries(
    $$("#advanced-fields input").map((i) => [i.dataset.field, i.value]),
  );
  $("#advanced-fields").innerHTML = data.fields
    .filter((f) => f.key !== "carrier")
    .map(
      (f) =>
        `<label>${e(names[f.key] || f.label)}<input type="${f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}" ${f.type === "number" ? 'step="any" min="0"' : ""} data-field="${e(f.key)}" placeholder="${f.type === "date" ? "" : "ทั้งหมด"}" value="${e(saved[f.key] || "")}"></label>`,
    )
    .join("");
  $$("#advanced-fields input").forEach((i) =>
    i.addEventListener("input", scheduleRefresh),
  );
}
function setView(view) {
  state.view = view;
  const titles = {
    dashboard: [
      "ภาพรวมการนำเข้า",
      "ติดตามทุกขั้นตอน ตั้งแต่ต้นทางจนถึงการส่งมอบ",
      "ภาพรวม",
    ],
    records: [
      "ข้อมูลการนำเข้า",
      "ค้นหา กรอง และดูรายละเอียดรายการของทีม",
      "รายการนำเข้า",
    ],
    history: [
      "ประวัติการอัปโหลด",
      "ตรวจสอบการเพิ่มและอัปเดตข้อมูลย้อนหลัง",
      "ประวัติ",
    ],
  };
  const t = titles[view];
  $("#page-title").innerHTML = e(t[0]) + '<span class="heading-dot">.</span>';
  $("#page-subtitle").textContent = t[1];
  $("#breadcrumb-current").textContent = t[2];
  $$(".nav-item").forEach((b) =>
    b.classList.toggle("active", b.dataset.view === view),
  );
  $$(".view").forEach((v) => (v.hidden = v.id !== view + "-view"));
  $("#filter-section").hidden = view === "history";
  $("#empty-state").hidden = !(state.meta?.total === 0 && view === "dashboard");
  if (view === "dashboard" && state.meta?.total === 0)
    $("#dashboard-view").hidden = true;
  if (view === "history") loadHistory();
}
async function refresh(reloadMeta = false) {
  const seq = ++state.sequence;
  try {
    banner();
    if (reloadMeta || !state.meta) await loadMeta();
    const p = params();
    const pageParams = new URLSearchParams(p);
    pageParams.set("page", state.page);
    pageParams.set("page_size", state.pageSize);
    const [dash, records] = await Promise.all([
      api("/api/dashboard?" + p),
      api("/api/records?" + pageParams),
    ]);
    if (seq !== state.sequence) return;
    state.dash = dash;
    state.rows = records.rows;
    state.attention = dash.attention;
    renderDashboard(dash);
    renderRecords(records);
    $("#result-label").textContent = `${number(records.total)} รายการ`;
    const count = [...p.keys()].filter((k) => k !== "date_field").length;
    $("#filter-count").textContent = count || "";
    $("#last-updated").textContent = dash.updated_at
      ? "อัปเดตข้อมูลล่าสุด " + timestamp(dash.updated_at)
      : "พร้อมรับข้อมูลจาก Excel";
    setView(state.view);
  } catch (err) {
    if (seq === state.sequence) banner(err.message);
  }
}
let filterTimer;
function scheduleRefresh() {
  clearTimeout(filterTimer);
  state.page = 1;
  filterTimer = setTimeout(() => refresh(), 300);
}
function renderDashboard(d) {
  const c = d.counts;
  const cards = [
    ["งานนำเข้าทั้งหมด", c.jobs, "Jobs", "นับเลข Job ไม่ซ้ำ", "▣", "featured"],
    [
      "Invoice ทั้งหมด",
      c.invoices,
      "Invoices",
      "หนึ่งงานอาจมีหลาย Invoice",
      "▤",
      "",
    ],
    ["ตู้คอนเทนเนอร์", c.containers, "ตู้", "นับหมายเลขตู้ไม่ซ้ำ", "▥", ""],
    [
      "รอส่งมอบ",
      c.pending,
      "รายการ",
      `${number(c.overdue)} รายการเกินกำหนดส่ง`,
      "◷",
      "warn",
    ],
  ];
  $("#kpi-grid").innerHTML = cards
    .map(
      ([title, value, unit, caption, icon, cls]) =>
        `<article class="kpi ${cls}"><div class="kpi-top">${title}<span class="kpi-icon">${icon}</span></div><div class="kpi-number">${number(value)}<span class="kpi-unit">${unit}</span></div><div class="kpi-caption">${cls === "warn" ? '<span class="tiny-tag">ติดตาม</span>' : "<span>→</span>"}${caption}</div></article>`,
    )
    .join("");
  $("#total-cartons").textContent = number(c.cartons);
  $("#total-cbm").textContent = number(c.cbm, 3);
  $("#as-of").textContent = shortDate(d.as_of);
  drawTrend(d.trend);
  const groups = [
    ["ตรงกำหนด", c.on_time, "#287965"],
    ["ส่งล่าช้า", c.late, "#dfb479"],
    ["รอส่งมอบ", c.pending, "#dce7dc"],
    ["ส่งแล้ว ไม่ระบุแผน", c.unknown_plan, "#94a7c2"],
  ];
  let stop = 0;
  const gradient =
    groups
      .filter((g) => g[1])
      .map((g) => {
        const start = stop;
        stop += (g[1] / (c.records || 1)) * 100;
        return `${g[2]} ${start}% ${stop}%`;
      })
      .join(",") || "#edf2e9 0% 100%";
  $("#delivery-chart").innerHTML =
    `<div class="donut-area"><div class="donut" style="background:conic-gradient(${gradient})"></div><div class="donut-center"><strong>${c.on_time_rate === null ? "—" : number(c.on_time_rate, 1) + "%"}</strong><small>ส่งตรงกำหนด*</small></div></div>`;
  $("#delivery-legend").innerHTML =
    groups
      .filter((g) => g[1] || g[0] !== "ส่งแล้ว ไม่ระบุแผน")
      .map(
        (g) =>
          `<div class="legend-row"><span class="legend-dot" style="background:${g[2]}"></span>${g[0]}<strong>${number(g[1])}</strong><small>${number((g[1] / (c.records || 1)) * 100)}%</small></div>`,
      )
      .join("") +
    '<div class="chart-note" style="padding:4px 0 0">* คิดจากรายการส่งแล้วที่มี Delivery Plan</div>';
  drawBars("#carrier-chart", d.carriers.slice(0, 5), "ตู้");
  drawBars("#lead-chart", d.lead, "วัน");
  $("#attention-table").innerHTML = d.attention.length
    ? `<table><thead><tr><th>JOB / INVOICE</th><th>หมายเลขตู้</th><th>สายเรือ</th><th>กำหนดส่งมอบ</th><th>สถานะ</th></tr></thead><tbody>${d.attention.map((r, i) => `<tr data-index="${i}" data-source="attention"><td><span class="job-text">${e(r.job)}</span><br><small>${e(r.invoice)}</small></td><td>${e(r.container)}</td><td>${e(r.carrier)}</td><td>${shortDate(r.plan)}</td><td>${badge(r)}</td></tr>`).join("")}</tbody></table>`
    : '<div class="table-empty">✓ ไม่พบรายการเกินกำหนดส่งตามตัวกรองนี้</div>';
  bindRows("#attention-table");
}
function drawTrend(all) {
  const rows = all.slice(-30);
  if (!rows.length) {
    $("#trend-chart").innerHTML =
      '<div class="chart-empty">ยังไม่มีข้อมูล ATA ในช่วงที่เลือก<span>ลองเปลี่ยนตัวกรองหรืออัปโหลดไฟล์</span></div>';
    return;
  }
  const w = 600,
    h = 190,
    left = 35,
    right = 10,
    top = 15,
    bottom = 31;
  const max = Math.max(4, ...rows.map((r) => r.value));
  const step = (w - left - right) / rows.length;
  const bw = Math.min(48, step * 0.45);
  const gh = h - top - bottom;
  let svg = `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="กราฟจำนวน Job ตามวันที่ ATA"><title>จำนวนงานตามวันที่ ATA</title>`;
  for (let i = 0; i < 5; i++) {
    const y = top + (i * gh) / 4;
    svg += `<line x1="${left}" y1="${y}" x2="${w - right}" y2="${y}" stroke="#edf1eb" stroke-dasharray="3 4"/><text x="${left - 10}" y="${y + 3}" text-anchor="end" fill="#9cab9a" font-size="9">${number((max * (4 - i)) / 4)}</text>`;
  }
  rows.forEach((r, i) => {
    const x = left + step * (i + 0.5),
      bh = (r.value / max) * gh,
      y = top + gh - bh;
    svg += `<rect x="${x - bw / 2}" y="${y}" width="${bw}" height="${bh}" rx="3" fill="${i === rows.length - 1 ? "#176d58" : "#a7c5ae"}"><title>${e(r.label)}: ${r.value} Jobs</title></rect>`;
    if (rows.length < 12 || i % Math.ceil(rows.length / 8) === 0)
      svg += `<text x="${x}" y="${h - 10}" text-anchor="middle" fill="#98a793" font-size="9">${e(shortDate(r.label).replace(/\s\d+$/, ""))}</text>`;
  });
  $("#trend-chart").innerHTML = svg + "</svg>";
}
function drawBars(selector, rows, unit) {
  if (!rows.length) {
    $(selector).innerHTML =
      '<div class="chart-empty">ยังไม่มีข้อมูลเพียงพอสำหรับกราฟนี้</div>';
    return;
  }
  const max = Math.max(1, ...rows.map((r) => r.value));
  $(selector).innerHTML = rows
    .map(
      (r) =>
        `<div class="bar-row"><div class="bar-top"><span>${e(r.label)}${r.samples !== undefined ? `<small>${r.samples} Jobs</small>` : ""}</span><strong>${number(r.value, 1)} <small>${unit}</small></strong></div><div class="bar-track"><div class="bar-fill" style="width:${(r.value / max) * 100}%"></div></div></div>`,
    )
    .join("");
}
function renderRecords(data) {
  $("#records-table").innerHTML = data.rows.length
    ? `<table><thead><tr><th>JOB</th><th>INVOICE NO</th><th>หมายเลขตู้</th><th>สายเรือ</th><th>ETA</th><th>ATA</th><th>กำหนดส่ง</th><th>วันส่งจริง</th><th>สถานะ</th><th>CARTONS / JOB</th><th>CBM / JOB</th></tr></thead><tbody>${data.rows.map((r, i) => `<tr data-index="${i}" data-source="rows"><td class="job-text">${e(r.job)}</td><td>${e(r.invoice)}</td><td>${e(r.container)}</td><td>${e(r.carrier)}</td><td>${shortDate(r.eta)}</td><td>${shortDate(r.ata)}</td><td>${shortDate(r.plan)}</td><td>${shortDate(r.delivered)}</td><td>${badge(r)}</td><td>${r.cartons == null ? "—" : number(r.cartons)}</td><td>${r.cbm == null ? "—" : number(r.cbm, 3)}</td></tr>`).join("")}</tbody></table>`
    : '<div class="table-empty">ไม่พบข้อมูล · ลองล้างตัวกรองหรืออัปโหลด Excel</div>';
  const start = data.total ? (data.page - 1) * data.page_size + 1 : 0;
  const end = Math.min(data.page * data.page_size, data.total);
  $("#page-summary").textContent =
    `${number(start)}–${number(end)} จาก ${number(data.total)} รายการ`;
  $("#prev-page").disabled = data.page <= 1;
  $("#next-page").disabled = end >= data.total;
  bindRows("#records-table");
}
function bindRows(selector) {
  $$(selector + " tr[data-index]").forEach((tr) => {
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute(
      "aria-label",
      "ดูรายละเอียด " + state[tr.dataset.source][Number(tr.dataset.index)].job,
    );
    const show = () =>
      showDetails(state[tr.dataset.source][Number(tr.dataset.index)]);
    tr.addEventListener("click", show);
    tr.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        show();
      }
    });
  });
}
function fieldValue(f, v) {
  if (v === null || v === undefined || v === "") return "—";
  if (f.type === "date")
    return (
      shortDate(v) +
      (String(v).includes("T") && v.slice(11, 19) !== "00:00:00"
        ? " · " + v.slice(11, 19)
        : "")
    );
  return f.type === "number" ? number(v, 3) : v;
}
function showDetails(r) {
  $("#detail-title").textContent = r.job;
  $("#detail-body").innerHTML =
    `<div style="margin-bottom:12px">${badge(r)}</div><dl class="detail-grid">${state.fields.map((f) => `<div class="detail-field"><dt>${e(f.label)}</dt><dd>${e(fieldValue(f, r[f.key]))}</dd></div>`).join("")}</dl>`;
  $("#detail-dialog").showModal();
}
async function loadHistory() {
  try {
    const data = await api("/api/history");
    state.history = data.rows;
    $("#history-table").innerHTML = data.rows.length
      ? `<table><thead><tr><th>ไฟล์</th><th>วันที่นำเข้า</th><th>เพิ่มใหม่</th><th>อัปเดต</th><th>ซ้ำ / ข้าม</th><th>ไม่สมบูรณ์</th></tr></thead><tbody>${data.rows.map((r, i) => `<tr data-history="${i}" tabindex="0" role="button" aria-label="ดูประวัติ ${e(r.filename)}"><td class="job-text">${e(r.filename)}</td><td>${timestamp(r.created_at)}</td><td>${number(r.added)}</td><td>${number(r.updated)}</td><td>${number(r.skipped)}</td><td>${number(r.invalid)}</td></tr>`).join("")}</tbody></table>`
      : '<div class="table-empty">ยังไม่มีประวัติการนำเข้า</div>';
    $$("#history-table tr[data-history]").forEach((tr) => {
      const show = () => showHistory(state.history[Number(tr.dataset.history)]);
      tr.addEventListener("click", show);
      tr.addEventListener("keydown", (evt) => {
        if (evt.key === "Enter") show();
      });
    });
  } catch (err) {
    banner(err.message);
  }
}
async function showHistory(batch) {
  try {
    const data = await api("/api/history/" + encodeURIComponent(batch.id));
    $("#detail-title").textContent = batch.filename;
    $("#detail-body").innerHTML =
      `<p class="import-tip">${timestamp(batch.created_at)} · แสดงรายละเอียดสูงสุด 100 รายการต่อการนำเข้า</p>` +
      data.rows
        .map((r) => {
          const before = r.before || {};
          const changed = Object.keys(r.after).filter(
            (k) => JSON.stringify(before[k]) !== JSON.stringify(r.after[k]),
          );
          return `<div class="change-list"><div><strong>${e(r.after.job)} · ${e(r.after.container)}</strong> <span class="badge ${r.before ? "wait" : "done"}">${r.before ? "อัปเดต" : "เพิ่มใหม่"}</span>${changed.map((k) => `<p>${e(state.fields.find((f) => f.key === k)?.label || k)}: ${r.before ? `<del>${e(before[k] ?? "—")}</del> → ` : ""}<ins>${e(r.after[k] ?? "—")}</ins></p>`).join("")}</div></div>`;
        })
        .join("");
    if (!data.rows.length)
      $("#detail-body").innerHTML +=
        '<div class="table-empty">ไฟล์นี้ไม่มีรายการใหม่หรือรายการอัปเดต</div>';
    $("#detail-dialog").showModal();
  } catch (err) {
    toast(err.message, true);
  }
}
function resetImport() {
  state.preview = null;
  $("#file-input").value = "";
  $("#upload-area").hidden = false;
  $("#import-loading").hidden = true;
  $("#import-preview").hidden = true;
  $("#import-error").hidden = true;
  $("#confirm-import").hidden = true;
  $("#confirm-import").disabled = false;
  $("#confirm-import").textContent = "ยืนยันนำเข้าข้อมูล →";
  $("#import-back").hidden = true;
  $("#step-two").classList.remove("active");
  $("#step-three").classList.remove("active");
}
function openImport() {
  resetImport();
  $("#import-dialog").showModal();
}
async function uploadFile(file) {
  if (!file) return;
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    importError("กรุณาเลือกไฟล์ .xlsx");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    importError("ไฟล์มีขนาดเกิน 10 MB");
    return;
  }
  $("#upload-area").hidden = true;
  $("#import-error").hidden = true;
  $("#import-loading").hidden = false;
  const form = new FormData();
  form.append("file", file);
  try {
    const p = await api("/api/import/preview", { method: "POST", body: form });
    state.preview = p;
    renderPreview(p);
  } catch (err) {
    importError(err.message);
    $("#upload-area").hidden = false;
  } finally {
    $("#import-loading").hidden = true;
  }
}
function importError(msg) {
  $("#import-error").textContent = msg;
  $("#import-error").hidden = false;
}
function renderPreview(p) {
  $("#step-two").classList.add("active");
  $("#import-preview").hidden = false;
  $("#import-back").hidden = false;
  $("#confirm-import").hidden = false;
  const c = p.counts;
  $("#import-preview").innerHTML =
    `<div class="preview-file">▤ ${e(p.filename)}<small>${e(p.sheets.join(", "))} · อ่าน ${number(p.total)} แถว</small></div><div class="preview-counts"><div><strong>${number(c.new)}</strong><span>รายการใหม่</span></div><div><strong>${number(c.updated)}</strong><span>รายการอัปเดต</span></div><div><strong>${number(c.unchanged)}</strong><span>ซ้ำ · ข้าม</span></div><div class="invalid"><strong>${number(c.invalid)}</strong><span>ไม่สมบูรณ์</span></div></div>${p.errors.length ? `<div class="preview-errors"><strong>แถวที่ไม่สามารถนำเข้าได้${c.invalid > 100 ? " (แสดง 100 แถวแรก)" : ""}</strong>${p.errors.map((r) => `<div>ชีต ${e(r.sheet)} · แถว ${r.row}: ${e(r.message)}</div>`).join("")}</div><label class="check-label"><input id="accept-invalid" type="checkbox"><span>ยืนยันข้าม ${number(c.invalid)} แถวที่ไม่สมบูรณ์ และนำเข้าเฉพาะรายการที่ผ่านการตรวจสอบ</span></label>` : ""}${p.changes.length ? `<details open><summary class="import-tip">รายการที่ข้อมูลเปลี่ยนแปลง (${number(c.updated)} รายการ · แสดงสูงสุด 100)</summary><div class="change-list">${p.changes.map((r) => `<div><strong>${e(r.job)} · ${e(r.container)}</strong>${r.fields.map((f) => `<p>${e(f.field)}: <del>${e(f.before ?? "—")}</del> → <ins>${e(f.after ?? "—")}</ins></p>`).join("")}</div>`).join("")}</div></details><label class="check-label"><input id="accept-updates" type="checkbox"><span>ยืนยันอัปเดต ${number(c.updated)} รายการ โดยเก็บข้อมูลก่อนแก้ไขไว้ในประวัติ</span></label>` : ""}<div class="import-tip">ยอด Cartons/CBM ของ Job เดียวกันต้องตรงกัน ระบบจะตรวจอีกครั้งก่อนบันทึก ข้อมูลจากไฟล์เก่าอาจทับสถานะใหม่ได้ โปรดตรวจรายการอัปเดตด้านบน</div>`;
  const updateButton = () =>
    ($("#confirm-import").disabled =
      !(c.new + c.updated + c.unchanged) ||
      Boolean(c.invalid && !$("#accept-invalid")?.checked) ||
      Boolean(c.updated && !$("#accept-updates")?.checked));
  $$("#import-preview input[type=checkbox]").forEach((i) =>
    i.addEventListener("change", updateButton),
  );
  updateButton();
}
async function confirmImport() {
  if (!state.preview) return;
  const button = $("#confirm-import");
  button.disabled = true;
  button.textContent = "กำลังบันทึก…";
  $("#import-error").hidden = true;
  try {
    const result = await api("/api/import/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: state.preview.token,
        accept_updates: Boolean($("#accept-updates")?.checked),
        skip_invalid: Boolean($("#accept-invalid")?.checked),
      }),
    });
    $("#step-three").classList.add("active");
    $("#import-dialog").close();
    toast(
      `บันทึกแล้ว · เพิ่ม ${result.counts.new} อัปเดต ${result.counts.updated} รายการ`,
    );
    state.page = 1;
    await refresh(true);
  } catch (err) {
    importError(err.message);
  } finally {
    button.disabled = false;
    button.textContent = "ยืนยันนำเข้าข้อมูล →";
  }
}
async function exportReport(kind) {
  $("#export-menu").hidden = true;
  if (kind === "pdf") {
    setView("dashboard");
    let caption = $(".print-caption");
    if (!caption) {
      caption = document.createElement("p");
      caption.className = "print-caption";
      $(".status-line").after(caption);
    }
    const p = params();
    const labels = {
      q: "ค้นหา",
      date_field: "ประเภทวันที่",
      from: "ตั้งแต่",
      to: "ถึง",
      status: "สถานะ",
    };
    caption.textContent =
      "รายงาน ณ " +
      timestamp(new Date().toISOString()) +
      " · ตัวกรอง: " +
      [...p]
        .map(
          ([k, v]) =>
            (labels[k] || names[k.slice(2)] || k) +
            ": " +
            (k === "date_field" ? dateNames[v] || v : v),
        )
        .join(" / ");
    window.print();
    return;
  }
  try {
    toast("กำลังสร้างรายงานตามตัวกรอง…");
    const response = await fetch("/api/export/" + kind + "?" + params());
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.detail || "ส่งออกไม่สำเร็จ");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      "harbor-report-" + new Date().toISOString().slice(0, 10) + "." + kind;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast(
      kind === "csv"
        ? "ส่งออก CSV แล้ว · Cartons/CBM ในแต่ละแถวเป็นยอดต่อ Job"
        : "ส่งออก Excel แล้ว · ดูยอดไม่ซ้ำในชีต Job totals",
    );
  } catch (err) {
    toast(err.message, true);
  }
}

$("#date-field").innerHTML = Object.entries(dateNames)
  .map(([k, v]) => `<option value="${k}">${v}</option>`)
  .join("");
$$(".nav-item").forEach((b) =>
  b.addEventListener("click", () => setView(b.dataset.view)),
);
$$("[data-import]").forEach((b) => b.addEventListener("click", openImport));
$("#file-input").addEventListener("change", (evt) =>
  uploadFile(evt.target.files[0]),
);
$("#drop-zone").addEventListener("dragover", (evt) => {
  evt.preventDefault();
  $("#drop-zone").classList.add("drag");
});
$("#drop-zone").addEventListener("dragleave", () =>
  $("#drop-zone").classList.remove("drag"),
);
$("#drop-zone").addEventListener("drop", (evt) => {
  evt.preventDefault();
  $("#drop-zone").classList.remove("drag");
  uploadFile(evt.dataTransfer.files[0]);
});
$("#confirm-import").addEventListener("click", confirmImport);
$("#import-back").addEventListener("click", resetImport);
$("#search").addEventListener("input", scheduleRefresh);
[
  "date-field",
  "date-from",
  "date-to",
  "filter-carrier",
  "filter-status",
].forEach((id) => $("#" + id).addEventListener("change", scheduleRefresh));
$("#more-filters").addEventListener("click", () => {
  const panel = $("#advanced-filters");
  panel.hidden = !panel.hidden;
  $("#more-filters").setAttribute("aria-expanded", String(!panel.hidden));
});
$("#clear-filters").addEventListener("click", () => {
  $("#search").value = "";
  $("#date-from").value = "";
  $("#date-to").value = "";
  $("#date-field").value = "eta";
  $("#filter-carrier").value = "";
  $("#filter-status").value = "";
  $$("#advanced-fields input").forEach((i) => (i.value = ""));
  state.page = 1;
  refresh();
});
$("#refresh").addEventListener("click", () => refresh(true));
$("#export-toggle").addEventListener(
  "click",
  () => ($("#export-menu").hidden = !$("#export-menu").hidden),
);
document.addEventListener("click", (evt) => {
  if (!evt.target.closest(".export-wrap")) $("#export-menu").hidden = true;
});
$$("[data-export]").forEach((b) =>
  b.addEventListener("click", () => exportReport(b.dataset.export)),
);
$("#prev-page").addEventListener("click", () => {
  state.page--;
  refresh();
});
$("#next-page").addEventListener("click", () => {
  state.page++;
  refresh();
});
$("#page-size").addEventListener("change", () => {
  state.pageSize = Number($("#page-size").value);
  state.page = 1;
  refresh();
});
$("#view-overdue").addEventListener("click", () => {
  $("#filter-status").value = "overdue";
  state.page = 1;
  setView("records");
  refresh();
});
$("#help-button").addEventListener("click", () => {
  $("#detail-title").textContent = "เริ่มใช้งาน Harbor";
  $("#detail-body").innerHTML =
    '<ol class="help-copy"><li><strong>อัปโหลด Excel</strong> ที่มี Header รูปแบบเดียวกับไฟล์ต้นฉบับ เลือกไฟล์ .xlsx ระบบจะตรวจทุกชีตที่ตรงรูปแบบ</li><li><strong>ตรวจสอบก่อนบันทึก</strong> รายการใหม่จะเพิ่มต่อ ข้อมูลเดิมที่เปลี่ยนแปลงต้องยืนยัน และแถวที่ไม่สมบูรณ์ต้องยืนยันข้าม</li><li><strong>ติดตามงานบน Dashboard</strong> เลือกประเภทวันที่ ช่วงวันที่ หรือกรองเพิ่มเติมตาม Header กดแถวในตารางเพื่อดูรายละเอียด</li><li><strong>ส่งออกรายงาน</strong> Excel มีชีตยอดรวมต่อ Job, CSV เป็นรายละเอียด และ PDF ใช้เมนูพิมพ์ของเบราว์เซอร์แล้วเลือก Save as PDF</li><li><strong>ทำงานร่วมกัน</strong> ทุกคนที่มีลิงก์ดู อัปโหลด และอัปเดตได้ ระบบรีเฟรชข้อมูลทุก 30 วินาทีเมื่อไม่ได้เปิดหน้าต่างตรวจข้อมูล</li></ol><p class="import-tip">รุ่นทดลอง: .xlsx ไม่เกิน 10 MB / 10,000 แถวต่อไฟล์ และข้อมูลสะสม 100,000 รายการ · ข้อมูลจริงเก็บบนเซิร์ฟเวอร์ร่วมกัน</p>';
  $("#detail-dialog").showModal();
});
setInterval(() => {
  if (!document.hidden && !$("dialog[open]")) refresh(true);
}, 30000);
refresh(true);
