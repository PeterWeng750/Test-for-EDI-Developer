/* Excel files stay in the browser. Never evaluate workbook formulas or text. */
importScripts("./vendor/exceljs-4.4.0.min.js", "./data.js");
self.onmessage = async (event) => {
  try {
    const bytes = event.data;
    const view = new DataView(bytes);
    let expanded = 0,
      entries = 0;
    // Inspect ZIP central-directory sizes before decompressing an XLSX.
    for (let i = 0; i + 46 <= view.byteLength; i++)
      if (view.getUint32(i, true) === 0x02014b50) {
        expanded += view.getUint32(i + 24, true);
        entries++;
        if (expanded > 80 * 1024 * 1024 || entries > 2000)
          throw Error("ไฟล์ Excel หลังคลายขนาดใหญ่เกินขีดจำกัด 80 MB");
        i +=
          45 +
          view.getUint16(i + 28, true) +
          view.getUint16(i + 30, true) +
          view.getUint16(i + 32, true);
      }
    if (!entries) throw Error("กรุณาเลือกไฟล์ .xlsx ที่ไม่เข้ารหัส");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes);
    const sheets = wb.worksheets.map((ws) => {
      if (ws.rowCount > 50000 || ws.columnCount > 100)
        throw Error("จำนวนแถวหรือคอลัมน์เกินขีดจำกัดรุ่นทดลอง");
      const rows = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        rows[row.number - 1] = row.values.slice(1);
      });
      return { name: ws.name, rows };
    });
    self.postMessage({
      ok: true,
      value: HarborData.parseSheets(sheets, wb.properties.date1904),
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error.message || "ไม่สามารถอ่านไฟล์ Excel นี้ได้",
    });
  }
};
