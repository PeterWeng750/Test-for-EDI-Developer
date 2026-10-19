/* Pure data rules shared by the free browser app and Node tests. */
(function (root) {
  "use strict";
  const FIELDS = [
    ["job", "Job I"],
    ["eta", "ETA"],
    ["ata", "ATA"],
    ["invoice", "Invoice No"],
    ["origin", "Origin(Port Name)"],
    ["port", "Release Port"],
    ["carrier", "Carrier Name"],
    ["container", "CTNR NO."],
    ["container_count", "CTNR NO. Count"],
    ["seal", "Seal"],
    ["size", "Container Size"],
    ["cartons", "Cartons"],
    ["cbm", "CBM"],
    ["file_date", "FileNameDate"],
    ["do_release", "DO Release"],
    ["received", "Shipping Document receive (วันที่ได้เอกสารในการทำใบขน)"],
    ["issue", "Shipping Document issue reason (ข้อมูลผิดรอแก้ไข)"],
    ["complete", "Shipping Document Complete (วันที่ได้เอกสารพร้อมทำใบขน)"],
    ["declaration_status", "Status Declaration"],
    ["customs", "Customs Relese Import (Declaration complete) (0209)"],
    ["plan", "Delivery Plan"],
    ["release", "Import Decleration Relese (0309)"],
    ["delivered", "Delivery Date (Customs)"],
    ["place", "Delivery Place"],
  ];
  const LABELS = Object.fromEntries(FIELDS);
  Object.assign(LABELS, {
    received_first: "วันที่รับครั้งแรก",
    received_latest: "วันที่รับเอกสารแก้ไขล่าสุด",
    po: "PO No",
  });
  const DATES = new Set([
    "eta",
    "ata",
    "file_date",
    "do_release",
    "complete",
    "customs",
    "plan",
    "release",
    "delivered",
    "received_first",
    "received_latest",
  ]);
  const NUMBERS = new Set(["cartons", "cbm", "container_count"]);
  const norm = (v) =>
    String(v ?? "")
      .replace(/\s+/gu, " ")
      .trim()
      .toLowerCase();
  const key = (r) => [norm(r.job), norm(r.invoice), norm(r.container)];
  const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
  const label = (k) => LABELS[k] || k.replace(/^extra:/, "");
  const iso = (date) => date.toISOString().slice(0, 19);
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

  function dateValue(value, date1904 = false) {
    if (value == null || value === "") return "";
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) throw Error("วันที่ไม่ถูกต้อง");
      return iso(value);
    }
    let s = String(value).trim(),
      match;
    if (/^\d{8}$/.test(s))
      s = s.slice(0, 4) + "-" + s.slice(4, 6) + "-" + s.slice(6, 8);
    else if (typeof value === "number") {
      if (!Number.isFinite(value) || value < 1 || value > 2958465)
        throw Error("วันที่ Excel ไม่ถูกต้อง");
      return iso(
        new Date(
          Date.UTC(
            date1904 ? 1904 : 1899,
            date1904 ? 0 : 11,
            date1904 ? 1 : 30,
          ) + Math.round(value * 86400000),
        ),
      );
    }
    if (
      (match = s.match(
        /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
      ))
    ) {
      s = `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}T${match[4] || "00"}:${match[5] || "00"}:${match[6] || "00"}`;
    }
    const simple = s.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (!simple) throw Error("วันที่ต้องเป็น YYYY-MM-DD หรือ DD/MM/YYYY");
    const canonical = `${simple[1]}-${simple[2]}-${simple[3]}T${simple[4] || "00"}:${simple[5] || "00"}:${simple[6] || "00"}`;
    const parsed = new Date(canonical + "Z");
    if (!Number.isFinite(parsed.getTime()) || iso(parsed) !== canonical)
      throw Error("วันที่หรือเวลาไม่ถูกต้อง");
    return canonical;
  }

  function cellValue(cell) {
    if (cell == null) return "";
    if (typeof cell !== "object" || cell instanceof Date) return cell;
    if ("formula" in cell || "sharedFormula" in cell)
      throw Error("พบสูตร Excel กรุณาวางเป็นค่าก่อนนำเข้า");
    if (cell.richText)
      return cell.richText.map((part) => part.text || "").join("");
    if ("text" in cell) return cell.text;
    if (cell.error) throw Error("พบค่า Error ใน Excel");
    throw Error("ค่าของเซลล์ไม่รองรับ");
  }

  function parseSheets(sheets, date1904 = false) {
    const aliases = new Map(
      Object.entries(LABELS).map(([k, v]) => [norm(v), k]),
    );
    ["po", "po no", "po no.", "po number"].forEach((k) => aliases.set(k, "po"));
    const output = [],
      errors = [],
      matched = [],
      seen = new Map();
    let total = 0,
      duplicates = 0;
    for (const sheet of sheets) {
      const header = sheet.rows[0] || [],
        mapping = [];
      header.forEach((cell, i) => {
        const v = cellValue(cell);
        if (v !== "" && v != null)
          mapping.push([
            i,
            aliases.get(norm(v)) || "extra:" + String(v).trim(),
          ]);
      });
      const keys = mapping.map(([i, k]) => k);
      if (!["job", "invoice", "container"].every((k) => keys.includes(k)))
        continue;
      const missing = FIELDS.map(([k]) => k).filter(
        (k) => k !== "declaration_status" && !keys.includes(k),
      );
      if (missing.length)
        throw Error(
          `ชีต ${sheet.name}: ขาด Header ${missing.map(label).join(", ")}`,
        );
      if (new Set(keys).size !== keys.length)
        throw Error(`ชีต ${sheet.name}: Header ซ้ำ`);
      matched.push(sheet.name);
      for (let i = 1; i < sheet.rows.length; i++) {
        const cells = sheet.rows[i] || [];
        if (!cells.some((v) => v != null && v !== "")) continue;
        if (++total > 10000)
          throw Error("รุ่นฟรีรองรับไม่เกิน 10,000 แถวต่อไฟล์");
        let r;
        try {
          r = Object.create(null);
          for (const [index, k] of mapping) {
            if (k === "declaration_status") continue;
            const value = cellValue(cells[index]);
            if (DATES.has(k)) r[k] = dateValue(value, date1904);
            else if (NUMBERS.has(k)) {
              const n =
                value == null || value === ""
                  ? null
                  : Number(String(value).replaceAll(",", ""));
              if (
                n !== null &&
                (!Number.isFinite(n) ||
                  n < 0 ||
                  n > 1e12 ||
                  (k !== "cbm" && !Number.isInteger(n)))
              )
                throw Error(
                  `${label(k)} ต้องเป็นจำนวนที่ไม่ติดลบ${k !== "cbm" ? "และเป็นจำนวนเต็ม" : ""}`,
                );
              r[k] = n;
            } else r[k] = value == null ? "" : String(value).trim();
          }
          const missingKeys = ["job", "invoice", "container"].filter(
            (k) => !norm(r[k]),
          );
          if (missingKeys.length)
            throw Error("ขาด " + missingKeys.map(label).join(", "));
          if (
            Object.values(r).some(
              (v) => typeof v === "string" && v.length > 5000,
            )
          )
            throw Error("ข้อความยาวเกิน 5,000 ตัวอักษร");
          const text = r.received || "",
            times = text.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/g) || [];
          if (
            text &&
            (times.length < 1 ||
              times.length > 2 ||
              text
                .replace(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}/g, "")
                .trim())
          )
            throw Error("ช่องรับเอกสารต้องมีวันเวลา 1 หรือ 2 ชุด");
          r.received_first = times.length ? dateValue(times[0]) : "";
          r.received_latest = times.length === 2 ? dateValue(times[1]) : "";
          if (r.received_latest && r.received_latest < r.received_first)
            throw Error("วันรับเอกสารแก้ไขอยู่ก่อนวันรับครั้งแรก");
        } catch (error) {
          errors.push({
            sheet: sheet.name,
            row: i + 1,
            message: error.message,
          });
          continue;
        }
        const identity = JSON.stringify(key(r)),
          existing = seen.get(identity);
        if (existing) {
          if (stable(existing) !== stable(r))
            throw Error(
              "คีย์ Job + Invoice + ตู้ ซ้ำแต่ข้อมูลต่างกันภายในไฟล์ กรุณาแก้ไขก่อนนำเข้า",
            );
          duplicates++;
          continue;
        }
        seen.set(identity, r);
        output.push({ key: key(r), record: r, row: i + 1, sheet: sheet.name });
      }
    }
    if (!matched.length)
      throw Error("ไม่พบชีตที่มี Header Job I, Invoice No และ CTNR NO.");
    return {
      rows: output,
      errors,
      sheets: matched,
      duplicates_in_file: duplicates,
      total,
    };
  }

  function fields(rows) {
    const keys = FIELDS.map(([k]) => k).filter(
      (k) => !["received", "declaration_status"].includes(k),
    );
    keys.splice(
      keys.indexOf("complete"),
      0,
      "received_first",
      "received_latest",
    );
    const extras = [
      ...new Set(
        rows.flatMap((r) =>
          Object.keys(r).filter((k) => k === "po" || k.startsWith("extra:")),
        ),
      ),
    ].sort();
    return [...keys, ...extras].map((k) => ({
      key: k,
      label: label(k),
      type: DATES.has(k) ? "date" : NUMBERS.has(k) ? "number" : "text",
    }));
  }

  function filter(rows, params = new URLSearchParams()) {
    const df = params.get("date_field") || "eta",
      from = params.get("from") || "",
      to = params.get("to") || "",
      q = norm(params.get("q"));
    if (!DATES.has(df)) throw Error("คอลัมน์วันที่ไม่ถูกต้อง");
    if (from && to && from > to)
      throw Error("วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด");
    const asof = today(),
      status = params.get("status");
    return rows.filter((r) => {
      if (
        q &&
        ![
          "job",
          "invoice",
          "container",
          "po",
          "carrier",
          "origin",
          "place",
        ].some((k) => norm(r[k]).includes(q))
      )
        return false;
      const value = (r[df] || "").slice(0, 10);
      if ((from && (!value || value < from)) || (to && (!value || value > to)))
        return false;
      for (const [k, v] of params) {
        if (k.startsWith("f_") && v) {
          const field = k.slice(2);
          if (NUMBERS.has(field)) {
            if (r[field] == null || Number(r[field]) !== Number(v))
              return false;
          } else if (!norm(r[field]).includes(norm(v))) return false;
        }
      }
      if (status === "delivered" && !r.delivered) return false;
      if (status === "pending" && r.delivered) return false;
      if (
        status === "overdue" &&
        (r.delivered || !r.plan || r.plan.slice(0, 10) >= asof)
      )
        return false;
      if (
        status === "late" &&
        (!r.delivered ||
          !r.plan ||
          r.delivered.slice(0, 10) <= r.plan.slice(0, 10))
      )
        return false;
      return true;
    });
  }

  function dashboard(rows, updated = null, asof = today()) {
    const jobs = new Map(rows.map((r) => [norm(r.job), r]));
    const c = {
      jobs: jobs.size,
      invoices: new Set(rows.map((r) => norm(r.invoice))).size,
      containers: new Set(rows.map((r) => norm(r.container))).size,
      records: rows.length,
      cartons: 0,
      cbm: 0,
      pending: 0,
      overdue: 0,
      delivered: 0,
      late: 0,
      on_time: 0,
      unknown_plan: 0,
    };
    for (const r of jobs.values()) {
      c.cartons += r.cartons || 0;
      c.cbm += r.cbm || 0;
    }
    c.cbm = Number(c.cbm.toFixed(3));
    const carriers = new Map(),
      trends = new Map(),
      groups = new Map(),
      issues = new Set(),
      attention = [];
    const add = (m, k, v) => {
      if (!m.has(k)) m.set(k, new Set());
      m.get(k).add(v);
    };
    for (const r of rows) {
      const plan = (r.plan || "").slice(0, 10),
        delivered = (r.delivered || "").slice(0, 10);
      if (delivered) {
        c.delivered++;
        if (plan) c[delivered > plan ? "late" : "on_time"]++;
        else c.unknown_plan++;
      } else {
        c.pending++;
        if (plan && plan < asof) {
          c.overdue++;
          attention.push(r);
        }
      }
      add(carriers, r.carrier || "ไม่ระบุ", norm(r.container));
      if (r.ata) add(trends, r.ata.slice(0, 10), norm(r.job));
      if (r.issue) issues.add(norm(r.job));
      if (!groups.has(norm(r.job))) groups.set(norm(r.job), []);
      groups.get(norm(r.job)).push(r);
    }
    c.issue_jobs = issues.size;
    c.on_time_rate =
      c.on_time + c.late
        ? Math.round((c.on_time / (c.on_time + c.late)) * 1000) / 10
        : null;
    const lead = [];
    for (const [name, start, end] of [
      ["เตรียมเอกสาร", "received_first", "complete"],
      ["เอกสาร → ศุลกากร", "complete", "customs"],
      ["ศุลกากร → ส่งมอบ", "customs", "delivered"],
    ]) {
      const durations = [];
      for (const group of groups.values())
        if (group.every((r) => r[start] && r[end])) {
          const days =
            (Math.max(...group.map((r) => Date.parse(r[end] + "Z"))) -
              Math.min(...group.map((r) => Date.parse(r[start] + "Z")))) /
            86400000;
          if (Number.isFinite(days) && days >= 0) durations.push(days);
        }
      if (durations.length)
        lead.push({
          label: name,
          value:
            Math.round(
              (durations.reduce((a, b) => a + b, 0) / durations.length) * 10,
            ) / 10,
          samples: durations.length,
        });
    }
    return {
      counts: c,
      carriers: [...carriers]
        .map(([label, v]) => ({ label, value: v.size }))
        .sort((a, b) => b.value - a.value),
      trend: [...trends]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, v]) => ({ label, value: v.size })),
      lead,
      attention: attention
        .sort((a, b) => a.plan.localeCompare(b.plan))
        .slice(0, 5),
      updated_at: updated,
      as_of: asof,
    };
  }

  function prepare(parsed, snapshot) {
    const current = new Map(
      snapshot.records.map((r) => [JSON.stringify(r.key), r]),
    );
    const counts = {
        new: 0,
        updated: 0,
        unchanged: parsed.duplicates_in_file,
        invalid: parsed.errors.length,
      },
      changes = [];
    for (const item of parsed.rows) {
      const old = current.get(JSON.stringify(item.key));
      item.old_version = old?.version ?? null;
      item.action = !old
        ? "new"
        : stable(old.data) === stable(item.record)
          ? "unchanged"
          : "updated";
      counts[item.action]++;
      if (item.action === "updated" && changes.length < 100) {
        const keys = [
          ...new Set([...Object.keys(old.data), ...Object.keys(item.record)]),
        ].sort();
        changes.push({
          job: item.record.job,
          invoice: item.record.invoice,
          container: item.record.container,
          fields: keys
            .filter((k) => (old.data[k] ?? null) !== (item.record[k] ?? null))
            .map((k) => ({
              field: label(k),
              before: old.data[k],
              after: item.record[k],
            })),
        });
      }
    }
    return {
      ...parsed,
      counts,
      changes,
      sample: parsed.rows.slice(0, 5).map((r) => r.record),
    };
  }

  function validateTotals(rows) {
    const totals = new Map();
    for (const r of rows) {
      const k = norm(r.job),
        value = JSON.stringify([r.cartons ?? null, r.cbm ?? null]);
      if (totals.has(k) && totals.get(k) !== value)
        throw Error(
          "Cartons/CBM ของ Job เดียวกันไม่ตรงกัน กรุณาอัปโหลดครบทุกแถวของ Job นั้น",
        );
      totals.set(k, value);
    }
  }

  const api = {
    FIELDS,
    LABELS,
    DATES,
    NUMBERS,
    norm,
    key,
    stable,
    label,
    today,
    dateValue,
    parseSheets,
    fields,
    filter,
    dashboard,
    prepare,
    validateTotals,
  };
  root.HarborData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
