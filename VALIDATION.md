# ผลตรวจสอบ Harbor Free

ตรวจวันที่ 19 ตุลาคม 2026 ในสภาพแวดล้อมพัฒนา Python 3.12.14 / Node 24 / PostgreSQL 17.11 / Chromium

## ผ่านแล้ว

- ชุดทดสอบ Python 25 กรณี: backend เดิม 13 และ PostgreSQL RPC รุ่นฟรี 12; Node data-rule tests 9 กรณี รวม 34 กรณีผ่าน ไม่มี skipped ในการรันที่ตั้ง HARBOR_TEST_DSN
- SQL ถูกติดตั้งและรันซ้ำบน PostgreSQL จริงโดยไม่ลบข้อมูลเดิม ใช้ role anon สำหรับ RPC ทดสอบการบันทึก การปฏิเสธยอด Job ที่ไม่ตรง การยืนยันอัปเดต ประวัติ และ stale version
- ผู้เขียนพร้อมกันสองคน: บันทึกสำเร็จหนึ่งคน อีกคนถูกปฏิเสธด้วย stale version; ผู้อ่านพร้อมกัน 30 คนอ่านได้ครบ
- role anon อ่านตารางและเรียก helper ใน schema ส่วนตัวโดยตรงไม่ได้ พื้นที่ทำงานคนละ token อ่านประวัติ/ข้อมูลข้ามกันไม่ได้
- Browser E2E เปิด static site ใต้ project subpath เหมือน GitHub Pages จริง ใช้สอง browser contexts แยกกันและ local test gateway ที่เรียก PostgreSQL RPC จริงในสิทธิ์ anon
- Import ผ่าน Web Worker พร้อมยืนยันข้ามแถวผิดรูปแบบ, เปรียบเทียบ/ยืนยันอัปเดต, ข้อมูลร่วมกันสอง browser contexts, Filter, แยกวันที่รับเอกสาร, ตารางแบ่งหน้า, รายละเอียด และประวัติผ่าน
- Excel/CSV download ตรวจเนื้อหาได้ถูกต้อง มีชีต Job totals ที่นับต่อ Job; PDF สร้างได้จาก print report
- ทดสอบ layout 390/768/1440 pixels ไม่มีหน้าเว็บล้นแนวนอน; reload ลิงก์ทีมแล้วข้อมูลยังอยู่
- โหมด demo ใช้ข้อมูลสมมติ 12 รายการและ browser storage แยกจาก shared mode ปุ่มลิงก์ทีมไม่เปิดในโหมด demo
- ไฟล์จริงของผู้ใช้ทดสอบอ่านใน browser context ชั่วคราว: 100 แถวที่ใช้ได้, 1 แถวผิดรูปแบบ, จำนวน 47 Jobs / 49 Invoices / 91 หมายเลขตู้ และยอดต่อ Job ตรงกับการตรวจต้นฉบับ ไม่เก็บไฟล์หรือข้อมูลจริงไว้ใน source, docs หรือภาพตัวอย่าง
- Assets และไลบรารี Excel โหลดจากเว็บไซต์เดียวกัน ไม่ต้องใช้ CDN ภายนอก ไฟล์ npm ExcelJS 4.4.0 ตรวจ SHA-512 ก่อนแตกไฟล์และแนบ license

## ยังต้องตั้งค่าในบัญชีผู้ใช้

- เปิด Settings → Pages ของ repository เลือก harbor-download /docs การ push docs ไม่ได้ยืนยันว่า Pages เผยแพร่แล้ว
- สร้าง Supabase Free project และรัน supabase/schema.sql จากนั้นกรอก URL + public key ในหน้าเว็บเพื่อสร้างลิงก์ทีม
- ยังไม่ได้ยืนยัน hosted Supabase API gateway/API key ของบัญชีผู้ใช้ หรือลิงก์ Pages ที่ live จริง Browser E2E ใช้ gateway ทดสอบในเครื่องที่เรียก PostgreSQL จริง ไม่ใช่การพิสูจน์ว่าบัญชีคลาวด์ถูกตั้งค่าแล้ว
- ไม่ได้ทดสอบ load ระยะยาวหรือเต็มขีดจำกัดสะสม 10,000 รายการ รุ่นนี้ออกแบบสำหรับไฟล์ทดลองตามที่ผู้ใช้ระบุ

ไม่มีการสร้างบริการเสียเงิน อัปเกรดแพ็กเกจ ใส่บัตร หรืออัปโหลดไฟล์ Excel จริงไป GitHub
