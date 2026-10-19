/* Static hosting adapter: Supabase RPC persistence, browser Excel, local demo. */
(function () {
  "use strict";
  const enabled = document.documentElement.dataset.runtime === "cloud";
  if (!enabled) {
    window.HarborCloud = { enabled: false };
    return;
  }
  const D = window.HarborData,
    storageKey = "harbor-link:" + location.pathname;
  let config = null,
    mode = null,
    snapshot = { records: [], batches: [], revision: -1 },
    pending = null,
    syncing = null,
    onReady = null;
  const $ = (s) => document.querySelector(s);
  const escape = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const bytesHex = (bytes) =>
    [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  const randomToken = () =>
    bytesHex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = async (data) =>
    bytesHex(new Uint8Array(await crypto.subtle.digest("SHA-256", data)));
  const allRows = () =>
    snapshot.records.map((r) => ({ ...r.data, updated_at: r.updated_at }));
  const dataRows = () => snapshot.records.map((r) => r.data);
  const serialize = (c) =>
    btoa(JSON.stringify([c.url, c.key, c.token]))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  const shareLink = () =>
    location.origin + location.pathname + "#join=" + serialize(config);
  const localDemoKey = "harbor-demo:" + location.pathname;

  function validConfig(c) {
    if (
      !c ||
      !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(c.url) ||
      !/^([0-9a-f]{64})$/.test(c.token)
    )
      throw Error("URL หรือรหัสพื้นที่ทำงานไม่ถูกต้อง");
    if (typeof c.key !== "string" || c.key.startsWith("sb_secret_"))
      throw Error(
        "ใช้ Publishable key หรือ anon key เท่านั้น ห้ามใช้ service_role/secret key",
      );
    if (!c.key.startsWith("sb_publishable_")) {
      try {
        const payload = JSON.parse(
          atob(c.key.split(".")[1].replaceAll("-", "+").replaceAll("_", "/")),
        );
        if (payload.role !== "anon") throw Error("role");
      } catch {
        throw Error(
          "คีย์นี้ไม่ใช่ anon key กรุณาใช้ Publishable key หรือ anon key",
        );
      }
    }
    if (c.key.length < 20 || c.key.length > 3000)
      throw Error("Public key ไม่ถูกต้อง");
    return c;
  }
  function parseLink() {
    const match = location.hash.match(/^#join=([A-Za-z0-9_-]+)$/);
    if (!match) return null;
    try {
      const [url, key, token] = JSON.parse(
        atob(match[1].replaceAll("-", "+").replaceAll("_", "/")),
      );
      return validConfig({ url, key, token });
    } catch {
      throw Error("ลิงก์ทีมไม่สมบูรณ์ กรุณาคัดลอกลิงก์เต็มอีกครั้ง");
    }
  }
  function remember() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(config));
    } catch {
      /* Shared link still works without browser storage. */
    }
  }
  function readRemembered() {
    try {
      const c = JSON.parse(localStorage.getItem(storageKey) || "null");
      return c ? validConfig(c) : null;
    } catch {
      return null;
    }
  }
  async function rpc(name, args = {}) {
    if (!config) throw Error("กรุณาเชื่อมต่อพื้นที่ทำงานก่อน");
    const headers = { "Content-Type": "application/json", apikey: config.key };
    if (config.key.startsWith("eyJ"))
      headers.Authorization = "Bearer " + config.key;
    let response;
    try {
      response = await fetch(config.url + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers,
        body: JSON.stringify({ p_token: config.token, ...args }),
        signal: AbortSignal.timeout(45000),
      });
    } catch {
      throw Error(
        "ติดต่อ Supabase ไม่ได้ ตรวจอินเทอร์เน็ตและดูว่าโปรเจกต์ถูกพักหรือไม่ แล้วลองเชื่อมต่อใหม่",
      );
    }
    let body;
    try {
      body = await response.json();
    } catch {
      throw Error("Supabase ตอบกลับไม่ถูกต้อง");
    }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403)
        throw Error(
          "เข้าถึงพื้นที่ทำงานไม่ได้ ตรวจ URL, Public key และลิงก์ทีม",
        );
      if (
        body.code === "PGRST202" ||
        String(body.message).includes("Could not find the function")
      )
        throw Error(
          "ยังไม่ได้ติดตั้งฐานข้อมูล กรุณารัน SQL ในขั้นตอนที่ 2 ก่อน",
        );
      throw Error(body.message || "ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่");
    }
    return body;
  }
  async function sync(force = false) {
    if (mode !== "shared") return;
    if (syncing) return syncing;
    syncing = (async () => {
      const result = await rpc("harbor_snapshot", {
        p_known_revision: force ? -1 : snapshot.revision,
      });
      if (!result.not_modified) snapshot = result;
    })();
    try {
      await syncing;
    } finally {
      syncing = null;
    }
  }

  function readWorkbook(buffer) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL("./import-worker.js", document.baseURI),
      );
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(Error("อ่านไฟล์เกิน 40 วินาที กรุณาแบ่งไฟล์ให้เล็กลง"));
      }, 40000);
      const finish = () => {
        clearTimeout(timeout);
        worker.terminate();
      };
      worker.onmessage = (e) => {
        finish();
        e.data.ok ? resolve(e.data.value) : reject(Error(e.data.error));
      };
      worker.onerror = () => {
        finish();
        reject(Error("เปิดตัวอ่าน Excel ไม่สำเร็จ กรุณารีเฟรชหน้าเว็บ"));
      };
      worker.postMessage(buffer, [buffer]);
    });
  }

  async function preview(options) {
    const file = options.body.get("file");
    if (!file || file.size > 10 * 1024 * 1024)
      throw Error("ไฟล์ต้องไม่เกิน 10 MB");
    await sync();
    const bytes = await file.arrayBuffer(),
      fileHash = await hash(bytes);
    if (snapshot.batches.some((b) => b.file_hash === fileHash))
      throw Error("ไฟล์นี้ถูกนำเข้าแล้ว");
    const parsed = await readWorkbook(bytes),
      prepared = D.prepare(parsed, snapshot);
    pending = {
      ...prepared,
      token: randomToken(),
      filename: file.name,
      file_hash: fileHash,
      created: Date.now(),
    };
    return { ...pending, errors: pending.errors.slice(0, 100) };
  }
  async function confirm(options) {
    const body = JSON.parse(options.body);
    if (
      !pending ||
      body.token !== pending.token ||
      Date.now() - pending.created > 86400000
    )
      throw Error("รายการตรวจสอบหมดอายุ กรุณาเลือกไฟล์ใหม่");
    const p = pending;
    if (p.counts.updated && !body.accept_updates)
      throw Error("กรุณายืนยันการอัปเดต");
    if (p.counts.invalid && !body.skip_invalid)
      throw Error("กรุณายืนยันข้ามแถวที่ไม่สมบูรณ์");
    if (!p.rows.length) throw Error("ไม่มีรายการที่นำเข้าได้");
    let result;
    if (mode === "shared") {
      result = await rpc("harbor_commit", {
        p_filename: p.filename,
        p_file_hash: p.file_hash,
        p_rows: p.rows.map((r) => ({
          data: r.record,
          old_version: r.old_version,
        })),
        p_accept_updates: body.accept_updates,
        p_skip_invalid: body.skip_invalid,
        p_invalid: p.counts.invalid,
        p_duplicates: p.duplicates_in_file,
      });
      pending = null;
      await sync(true);
    } else {
      const existing = new Map(
        snapshot.records.map((r) => [JSON.stringify(r.key), r]),
      );
      for (const r of p.rows) {
        const old = existing.get(JSON.stringify(r.key));
        if ((old?.version ?? null) !== r.old_version)
          throw Error("ข้อมูลเปลี่ยน กรุณาเลือกไฟล์ใหม่");
      }
      const next = new Map(existing),
        now = new Date().toISOString(),
        changes = [];
      for (const r of p.rows) {
        const identity = JSON.stringify(r.key),
          old = existing.get(identity);
        if (r.action !== "unchanged") {
          next.set(identity, {
            key: r.key,
            data: r.record,
            version: (old?.version || 0) + 1,
            updated_at: now,
          });
          changes.push({ before: old?.data ?? null, after: r.record, at: now });
        }
      }
      if (next.size > 10000)
        throw Error("รุ่นฟรีจำกัดข้อมูลสะสม 10,000 รายการ");
      D.validateTotals([...next.values()].map((r) => r.data));
      const id = randomToken().slice(0, 24);
      const batch = {
        id,
        filename: p.filename,
        file_hash: p.file_hash,
        created_at: now,
        added: p.counts.new,
        updated: p.counts.updated,
        skipped: p.counts.unchanged,
        invalid: p.counts.invalid,
        changes,
      };
      const replacement = {
        records: [...next.values()],
        batches: [batch, ...snapshot.batches].slice(0, 100),
        revision: snapshot.revision + 1,
      };
      try {
        localStorage.setItem(localDemoKey, JSON.stringify(replacement));
      } catch {
        throw Error(
          "พื้นที่เบราว์เซอร์เต็ม กรุณา Export ข้อมูลและเชื่อมฐานข้อมูลร่วมกัน",
        );
      }
      snapshot = replacement;
      pending = null;
      result = { batch_id: id, counts: p.counts };
    }
    return result;
  }

  async function api(path, options = {}) {
    if (!mode)
      throw Error("เลือกทดลองในเครื่องหรือเชื่อมพื้นที่ทำงานร่วมกันก่อน");
    const url = new URL(path, "https://harbor.invalid"),
      p = url.searchParams;
    if (url.pathname === "/api/import/preview") return preview(options);
    if (url.pathname === "/api/import/confirm") return confirm(options);
    if (url.pathname === "/api/meta") {
      await sync();
      const rows = dataRows();
      return {
        fields: D.fields(rows),
        total: rows.length,
        options: Object.fromEntries(
          ["carrier", "origin", "port", "size", "place"].map((k) => [
            k,
            [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort(),
          ]),
        ),
      };
    }
    if (url.pathname === "/api/dashboard")
      return D.dashboard(
        D.filter(dataRows(), p),
        snapshot.batches[0]?.created_at ?? null,
      );
    if (url.pathname === "/api/records") {
      const rows = D.filter(allRows(), p).sort(
        (a, b) =>
          b.updated_at.localeCompare(a.updated_at) ||
          JSON.stringify(D.key(a)).localeCompare(JSON.stringify(D.key(b))),
      );
      const size = Number(p.get("page_size") || 20),
        page = Number(p.get("page") || 1);
      return {
        total: rows.length,
        page,
        page_size: size,
        rows: rows.slice((page - 1) * size, page * size),
      };
    }
    if (url.pathname === "/api/history") {
      await sync();
      return { rows: snapshot.batches };
    }
    if (url.pathname.startsWith("/api/history/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      return mode === "shared"
        ? rpc("harbor_history", { p_batch_id: id })
        : {
            rows:
              snapshot.batches
                .find((b) => b.id === id)
                ?.changes?.slice(0, 100) || [],
          };
    }
    throw Error("ไม่พบคำสั่งนี้");
  }

  function safeCell(value) {
    return typeof value === "string" && /^[\s]*[=+@\-\t\r\n]/.test(value)
      ? "'" + value
      : (value ?? "");
  }
  async function exportBlob(kind, params) {
    const rows = D.filter(dataRows(), params),
      keys = [
        ...D.FIELDS.filter(([k]) => k !== "declaration_status").map(([k]) => k),
        ...D.fields(rows)
          .map((f) => f.key)
          .filter((k) => !D.FIELDS.some(([field]) => field === k)),
      ];
    const headers = keys.map((k) => safeCell(D.label(k))),
      values = rows.map((r) => keys.map((k) => safeCell(r[k])));
    if (kind === "csv") {
      const quote = (v) => '"' + String(v).replaceAll('"', '""') + '"';
      return new Blob(
        [
          "\uFEFF" +
            [headers, ...values]
              .map((r) => r.map(quote).join(","))
              .join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      );
    }
    const workbook = new ExcelJS.Workbook(),
      ws = workbook.addWorksheet("Filtered records");
    ws.addRow(headers);
    ws.addRows(values);
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: values.length + 1, column: keys.length },
    };
    ws.getRow(1).eachCell((c) => {
      c.font = { color: { argb: "FFFFFFFF" }, bold: true };
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF12695D" },
      };
    });
    ws.columns.forEach((c) => (c.width = 23));
    const totals = workbook.addWorksheet("Job totals");
    totals.addRow(["Job I", "Cartons (once per Job)", "CBM (once per Job)"]);
    for (const r of new Map(rows.map((r) => [D.norm(r.job), r])).values())
      totals.addRow([safeCell(r.job), r.cartons ?? null, r.cbm ?? null]);
    const notes = workbook.addWorksheet("Read me");
    notes.addRow([
      "Cartons and CBM are full Job totals repeated on detail rows. Sum the Job totals sheet.",
    ]);
    notes.addRow([
      "Filtered results include the full total of each represented Job.",
    ]);
    return new Blob([await workbook.xlsx.writeBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      const success = document.execCommand("copy");
      area.remove();
      return success;
    }
  }
  function connectionError(message) {
    $("#connect-error").textContent = message;
    $("#connect-error").hidden = false;
  }
  function setMode(next) {
    mode = next;
    document.body.dataset.connection = mode || "setup";
    $("#connection-badge").textContent =
      mode === "shared"
        ? "ข้อมูลร่วมกัน · Supabase Free"
        : "โหมดสาธิต · เฉพาะเครื่องนี้";
    $("#share-workspace").disabled = mode !== "shared";
    $("#setup-screen").hidden = Boolean(mode);
    $("#local-demo-note").hidden = mode !== "demo";
    $(".shared-note").innerHTML =
      mode === "shared"
        ? '<span class="live-dot"></span>ทุกคนในลิงก์เห็นข้อมูลร่วมกัน'
        : "ข้อมูลสาธิตเก็บเฉพาะเบราว์เซอร์นี้";
  }
  async function connect(c, create = false) {
    const previous = { config, mode, snapshot };
    config = validConfig(c);
    try {
      if (create) {
        await rpc("harbor_create_workspace");
        remember();
      }
      const result = await rpc("harbor_snapshot", { p_known_revision: -1 });
      snapshot = result;
      remember();
      history.replaceState(null, "", "#join=" + serialize(config));
      setMode("shared");
      pending = null;
      await onReady();
    } catch (error) {
      config = previous.config;
      mode = previous.mode;
      snapshot = previous.snapshot;
      throw error;
    }
  }
  function demo() {
    config = null;
    pending = null;
    try {
      snapshot = JSON.parse(localStorage.getItem(localDemoKey) || "null") || {
        records: [],
        batches: [],
        revision: 0,
      };
    } catch {
      snapshot = { records: [], batches: [], revision: 0 };
    }
    if (!snapshot.records.length && !snapshot.batches.length) {
      const day = D.today(),
        base = Date.parse(day + "T00:00:00Z"),
        date = (offset) =>
          new Date(base + offset * 86400000).toISOString().slice(0, 19),
        stamp = new Date().toISOString();
      const examples = Array.from({ length: 12 }, (_, i) => {
        const job = Math.floor(i / 2),
          start = -12 + job;
        return {
          job: `SAMPLE-${String(job + 1).padStart(3, "0")}`,
          invoice: `EXAMPLE-INV-${String(job + 1).padStart(3, "0")}`,
          container: `SAMPLE${String(i + 1).padStart(7, "0")}`,
          eta: date(start),
          ata: date(start + 1),
          origin: ["Singapore", "Shanghai", "Laem Chabang"][job % 3],
          port: "Demo Terminal",
          carrier: ["Ocean Line", "Pacific Cargo", "Blue Shipping"][job % 3],
          container_count: 1,
          seal: `DEMO-SEAL-${i + 1}`,
          size: "40H",
          cartons: 1200 + job * 100,
          cbm: 64.5 + job * 5,
          file_date: date(0),
          do_release: date(start + 1),
          received:
            date(start - 3).replace("T", " ") +
            " " +
            date(start - 1).replace("T", " "),
          received_first: date(start - 3),
          received_latest: date(start - 1),
          issue: i % 3 === 0 ? "ตัวอย่าง: เอกสารเคยแก้ไข" : "",
          complete: date(start),
          customs: date(start + 2),
          plan: date(start + 4),
          release: date(start + 2),
          delivered: i % 3 ? date(start + 4 + (i % 2)) : "",
          place: "Demo Warehouse",
        };
      });
      snapshot = {
        records: examples.map((r) => ({
          key: D.key(r),
          data: r,
          version: 1,
          updated_at: stamp,
        })),
        batches: [
          {
            id: "example-intro",
            filename: "ข้อมูลสมมติสำหรับทดลอง",
            file_hash: "0".repeat(64),
            created_at: stamp,
            added: 12,
            updated: 0,
            skipped: 0,
            invalid: 0,
            changes: examples.map((r) => ({
              before: null,
              after: r,
              at: stamp,
            })),
          },
        ],
        revision: 1,
      };
      try {
        localStorage.setItem(localDemoKey, JSON.stringify(snapshot));
      } catch {
        /* Demo examples can still be viewed in memory. */
      }
    }
    history.replaceState(null, "", location.pathname + "#demo");
    setMode("demo");
    onReady();
  }
  async function start(refresh) {
    onReady = refresh;
    const section = document.createElement("section");
    section.id = "setup-screen";
    section.className = "setup-screen";
    section.innerHTML = `<div class="eyebrow">HARBOR FREE EDITION</div><h1>เริ่มใช้งานฟรี แชร์ข้อมูลกับทีม</h1><p>หน้าเว็บอยู่บน GitHub Pages ส่วนข้อมูลร่วมกันเก็บใน Supabase Free<br>ไม่ใช้บริการ Render หรือ Persistent Disk แบบเสียเงิน</p><div class="setup-columns"><article><span class="setup-number">1</span><h2>สร้างฐานข้อมูลฟรี</h2><p>เข้า Supabase สร้าง Organization แบบ <strong>Free</strong> แล้วสร้าง Project หนึ่งครั้ง ตั้งรหัสผ่านฐานข้อมูลเก็บไว้กับคุณ</p><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" class="button secondary">เปิด Supabase →</a></article><article><span class="setup-number">2</span><h2>ติดตั้งตารางข้อมูล</h2><p>ใน Project เปิด <strong>SQL Editor → New query</strong> วาง SQL ที่คัดลอกด้วยปุ่มนี้แล้วกด <strong>Run</strong> ทำเพียงครั้งแรก</p><button id="copy-setup-sql" class="button secondary">คัดลอก SQL สำหรับติดตั้ง</button><small id="sql-copy-status" role="status"></small></article></div><form id="connect-form"><h2><span class="setup-number">3</span> เชื่อมต่อแล้วสร้างลิงก์ทีม</h2><p>คัดลอก Project URL และ Publishable key จากหน้า Connect หรือ Settings → API Keys ของ Supabase</p><label>Project URL<input id="supabase-url" type="url" placeholder="https://your-project.supabase.co" required autocomplete="off"></label><label>Publishable key หรือ anon key<input id="supabase-key" type="text" placeholder="sb_publishable_… หรือ anon JWT" required autocomplete="off" spellcheck="false"></label><small>ใช้ public key เท่านั้น ห้ามใส่ service_role, secret key หรือรหัสผ่านฐานข้อมูล</small><div class="setup-actions"><button id="connect-submit" type="submit" class="button primary">สร้างพื้นที่ทำงานและลิงก์ทีม →</button><button id="try-demo" type="button" class="button secondary">ทดลองในเครื่องก่อน</button></div><div id="connect-error" class="error-banner" role="alert" hidden></div></form><p class="setup-footnote">เลือก Free เท่านั้น บริการฟรีมีโควตาและอาจพักโปรเจกต์เมื่อไม่ได้ใช้งาน โหมดทดลองในเครื่องไม่แชร์ข้อมูลกับผู้อื่น</p>`;
    $("main").prepend(section);
    const note = document.createElement("div");
    note.id = "local-demo-note";
    note.className = "demo-banner";
    note.hidden = true;
    note.textContent =
      "โหมดสาธิต: ข้อมูลเก็บเฉพาะเบราว์เซอร์นี้ ยังไม่แชร์กับทีม กด “เชื่อมต่อ” เพื่อใช้ข้อมูลร่วมกัน";
    $(".page-heading").after(note);
    const bar = document.createElement("div");
    bar.className = "cloud-controls";
    bar.innerHTML =
      '<span id="connection-badge" class="prototype">ยังไม่เชื่อมต่อ</span><button id="share-workspace" class="button secondary" disabled>คัดลอกลิงก์ทีม</button><button id="connection-settings" class="text-button">เชื่อมต่อ</button>';
    $(".topbar-right").prepend(bar);
    $("#connection-settings").onclick = () => {
      if (mode) {
        $("#setup-screen").hidden = !$("#setup-screen").hidden;
      } else $("#setup-screen").hidden = false;
      section.scrollIntoView({ behavior: "smooth" });
    };
    $("#share-workspace").onclick = async () => {
      const link = shareLink();
      if (await copy(link)) {
        const old = $("#share-workspace").textContent;
        $("#share-workspace").textContent = "คัดลอกแล้ว ✓";
        setTimeout(() => ($("#share-workspace").textContent = old), 2500);
      } else {
        window.prompt("คัดลอกลิงก์นี้ให้เพื่อนร่วมงาน", link);
      }
    };
    $("#try-demo").onclick = demo;
    $("#copy-setup-sql").onclick = async () => {
      try {
        const response = await fetch(new URL("./setup.sql", document.baseURI));
        if (!response.ok) throw Error("อ่านไฟล์ตั้งค่าไม่ได้");
        const text = await response.text();
        if (!(await copy(text)))
          throw Error(
            "คัดลอกอัตโนมัติไม่ได้ เปิดไฟล์ setup.sql จาก repository แล้วคัดลอกข้อความทั้งหมด",
          );
        $("#sql-copy-status").textContent =
          "คัดลอกแล้ว — นำไปวางใน SQL Editor แล้วกด Run";
      } catch (error) {
        connectionError(error.message);
      }
    };
    $("#connect-form").onsubmit = async (event) => {
      event.preventDefault();
      const submit = $("#connect-submit");
      submit.disabled = true;
      $("#connect-error").hidden = true;
      try {
        const url = $("#supabase-url").value.trim().replace(/\/$/, ""),
          key = $("#supabase-key").value.trim();
        const previous = [config, readRemembered()].find(
          (c) => c?.url === url && c?.key === key,
        );
        const token = previous ? previous.token : randomToken();
        await connect({ url, key, token }, true);
      } catch (error) {
        connectionError(error.message);
      } finally {
        submit.disabled = false;
      }
    };
    document.body.dataset.connection = "setup";
    try {
      const c =
        parseLink() || (location.hash === "#demo" ? null : readRemembered());
      if (c) {
        $("#supabase-url").value = c.url;
        $("#supabase-key").value = c.key;
        await connect(c);
      } else if (location.hash === "#demo") demo();
    } catch (error) {
      connectionError(error.message);
    }
  }
  window.HarborCloud = {
    enabled: true,
    start,
    api,
    exportBlob,
    get mode() {
      return mode;
    },
    get connected() {
      return Boolean(mode);
    },
  };
})();
