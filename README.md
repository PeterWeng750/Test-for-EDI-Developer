# Harbor Free — Excel Dashboard สำหรับทีม

**รุ่นนี้ใช้ GitHub Pages + Supabase Free** ไม่ใช้ Render Starter หรือ Persistent Disk และไม่มี `render.yaml` ที่สร้างบริการเสียเงินอีกแล้ว หน้าเว็บเป็น static site ส่วนข้อมูลร่วมกันเก็บใน Supabase PostgreSQL

## เปิดเว็บฟรี

1. เข้า GitHub repository → **Settings → Pages**
2. Source เลือก **Deploy from a branch**
3. Branch เลือก **harbor-download** และโฟลเดอร์ **/docs** แล้วกด **Save**
4. รอ GitHub ประมวลผลจนหน้า Pages แสดงลิงก์ที่พร้อมใช้งาน แล้วเปิดลิงก์นั้น
5. ลิงก์ที่คาดไว้คือ `https://peterweng750.github.io/Test-for-EDI-Developer/` แต่ต้องเปิดใช้งาน Pages ในบัญชีก่อน ไม่ได้ยืนยันว่าลิงก์ live จากการ push โค้ดอย่างเดียว

GitHub Pages ฟรีสำหรับ repository สาธารณะบน GitHub Free หาก repository เป็น private ให้ตรวจสิทธิ์แพ็กเกจก่อน ไม่มีไฟล์ Excel จริง ฐานข้อมูล หรือคีย์ลับอยู่ในโค้ดที่ส่งขึ้น GitHub

ดูขั้นตอนพร้อมรายละเอียดใน [DEPLOY.md](DEPLOY.md)

## ทดลองก่อนสร้างฐานข้อมูล

หน้าเว็บมีปุ่ม **ทดลองในเครื่องก่อน** เปิด Dashboard พร้อมข้อมูลสมมติ 12 รายการ สามารถ Import, Filter, ดูกราฟ และ Export Excel/CSV/PDF ได้

โหมดนี้เก็บข้อมูลเฉพาะเบราว์เซอร์นั้นด้วย localStorage และมีป้ายแจ้งชัดเจน **ยังไม่แชร์ข้อมูลกับเพื่อนร่วมงาน** ปุ่มลิงก์ทีมจะไม่เปิดใช้ในโหมดนี้

## ใช้ข้อมูลร่วมกันจริง

ทำครั้งเดียวโดยเจ้าของโปรเจกต์:

1. สมัคร https://supabase.com/dashboard แล้วเลือก Organization แบบ **Free** และสร้าง Project หนึ่งโปรเจกต์ ไม่เลือก Pro/add-on แบบเสียเงิน
2. เปิด SQL Editor → New query วางข้อความทั้งหมดจาก [supabase/schema.sql](supabase/schema.sql) แล้ว Run หรือกด **คัดลอก SQL สำหรับติดตั้ง** ในหน้าเว็บ
3. นำ **Project URL** และ **Publishable key** (หรือ legacy anon key) ใส่ในหน้าตั้งค่าของ Harbor ใช้เฉพาะ public key ไม่ใช้ secret key/service_role key/รหัสผ่านฐานข้อมูล
4. กด **สร้างพื้นที่ทำงานและลิงก์ทีม** แล้วกด **คัดลอกลิงก์ทีม** ส่งลิงก์เต็มให้เพื่อน
5. เพื่อนเปิดลิงก์ทีมแล้วใช้งานข้อมูลเดียวกันได้ทันที ไม่ต้องตั้ง Supabase ซ้ำ

ลิงก์หน้าเว็บทั่วไปเปิดหน้าตั้งค่าหรือโหมดทดลอง ส่วน **ลิงก์ทีมมีส่วน `#join=...`** ซึ่งเป็นสิทธิ์เข้าพื้นที่ทำงาน ทุกคนที่มีลิงก์เต็มดู/Export/เพิ่ม/อัปเดตได้ตามที่ตกลงไว้ ผู้ใช้ไม่ต้องมีบัญชี Supabase แต่เจ้าของโปรเจกต์ต้องสร้างและตั้งค่าครั้งแรก ไม่มีระบบระบุตัวบุคคลหรือ PIN

Project URL/public key/ลิงก์ทีมถูกเก็บไว้เฉพาะ browser ของผู้ใช้เพื่อกลับมาใช้งาน ไม่ต้อง commit ลง repository และไม่ต้องส่งในแชต คีย์ public ออกแบบให้ใช้ใน browser ได้ ส่วน token ในลิงก์ทีมเป็นสิทธิ์เข้าข้อมูลและควรส่งเฉพาะทีมที่ต้องการให้เข้าถึง

## ความสามารถ

- Import `.xlsx` ที่มี Header ตามต้นฉบับ (หลายชีตได้) พร้อมคอลัมน์เพิ่มเติมและ PO หากมี
- อ่าน Excel ใน Web Worker ภายในเบราว์เซอร์ ไม่ส่งไฟล์ Excel ต้นฉบับไป GitHub หรือ Supabase เก็บเฉพาะข้อมูลแถวที่ยืนยันแล้ว
- ก่อนบันทึกแยก ใหม่/อัปเดต/ซ้ำ/ผิดรูปแบบ ต้องยืนยันการอัปเดตและยืนยันข้ามแถวที่ไม่สมบูรณ์
- ตรวจซ้ำด้วย Job + Invoice + หมายเลขตู้ และ SHA-256 ของไฟล์
- Supabase RPC บันทึกแบบ transaction ตรวจข้อมูลซ้ำ ตรวจยอดต่อ Job และป้องกัน preview เก่าเขียนทับการแก้ไขของผู้ใช้อื่น
- Filter ช่วงวันที่ตามประเภทวันที่และ Header, ค้นหาเลขอ้างอิง, ตารางแบ่งหน้าและรายละเอียดครบคอลัมน์
- Dashboard จำนวน Job/Invoice/ตู้ไม่ซ้ำ งานค้าง แนวโน้ม ATA ส่งตรงเวลา ปริมาณตู้ตามสายเรือ และระยะเวลาของขั้นตอน
- Export Excel พร้อมชีต Job totals, CSV ภาษาไทย, PDF ผ่าน Export → PDF → Save as PDF ของเบราว์เซอร์
- ประวัติค่าก่อน/หลังแก้ไข (แสดง 100 รายการต่อ batch) และนำเข้าล่าสุด 100 batch
- ตรวจ revision ทุก 30 วินาทีเมื่อหน้าเว็บทำงาน ถ้าไม่มีการเปลี่ยนแปลงไม่ต้องโหลดข้อมูลทั้งชุดซ้ำ

## กติกาข้อมูลสำคัญ

1. Cartons/CBM เป็นยอดเต็มต่อ Job รวมเพียงครั้งเดียว ยอดของ Job เดียวกันทุกแถวต้องตรงกัน การแก้ยอดต้องนำเข้าครบทุกแถวของ Job นั้น
2. เมื่อกรองพบบางตู้ของ Job ยอด Cartons/CBM ยังเป็นยอดเต็มของ Job ที่พบ ไม่ใช่ยอดจัดสรรต่อตู้
3. CTNR NO. Count เก็บจำนวนตู้ตามต้นฉบับ ส่วน KPI ใช้หมายเลขตู้ไม่ซ้ำเพื่อไม่รวมซ้ำในหลาย Invoice
4. แยกวันที่รับครั้งแรก/วันที่รับเอกสารแก้ไขล่าสุด ถ้ามีวันเดียว ช่องแก้ไขล่าสุดว่าง
5. วันส่งจริงว่างถือว่ายังไม่ส่งมอบ ไม่ใช้รหัส 409
6. ส่งล่าช้าเทียบวันส่งจริงกับ Delivery Plan ระดับวัน อัตราส่งตรงเวลาคิดจากรายการส่งแล้วที่มีแผนเท่านั้น วันปัจจุบันใช้เวลา Asia/Bangkok
7. เหตุผลแก้ไขเอกสารเป็นประวัติ ไม่ถือว่าเป็นปัญหาค้างโดยอัตโนมัติ
8. ถ้าคีย์ซ้ำแต่ข้อมูลต่างกันในไฟล์เดียว ปฏิเสธไฟล์เพื่อให้แก้ไขก่อน
9. ไม่รับสูตร Excel กรุณาวางเป็นค่าก่อนนำเข้า `.xls` ต้องบันทึกเป็น `.xlsx` ก่อน

## ขอบเขตของรุ่นฟรี

- เหมาะกับขนาดไฟล์ทดลองประมาณ 100 แถวตามที่ตกลง ไม่ใช่การรับรองรองรับข้อมูลหลักล้าน
- จำกัด 10 MB / 10,000 แถวต่อไฟล์ และสะสมสูงสุด 10,000 รายการต่อพื้นที่ทำงาน
- เมื่อข้อมูลเปลี่ยนจะโหลด snapshot ของพื้นที่ทำงานมากรอง/สรุปใน browser เหมาะกับข้อมูลทดลอง หากเพิ่มขนาดมากควรย้ายไปกรอง/สรุปและแบ่งหน้าที่ฐานข้อมูล
- Supabase Free มีโควตาและอาจพักโปรเจกต์เมื่อไม่มีการใช้งาน ให้เจ้าของ Resume ใน Dashboard หากถูกพัก ไม่ได้เปิดบริการเสียเงินหรือซื้อ add-on ให้อัตโนมัติ
- ตรวจเอกสารผู้ให้บริการก่อนเลือกแพ็กเกจ: [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase) และ [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)

## พัฒนาและทดสอบในเครื่อง

ไม่ต้องใช้ Node build framework สำหรับการเปิดเว็บ ใช้ Python HTTP server:

```bash
python scripts/build_pages.py
python -m http.server 8000 --directory dist
```

สำหรับ cloud task นี้ ใช้ checkout เดิม `/workspace/Test-for-EDI-Developer` ไม่ต้องสร้าง Git worktree เปิดลิงก์ loopback เฉพาะตรวจภายใน ไม่ใช่ลิงก์แชร์ให้เพื่อน

ทดสอบ data rules และ backend เดิม:

```bash
bash scripts/setup.sh
node --test tests/data.test.cjs
```

ทดสอบ Supabase SQL บน PostgreSQL 17+ ในฐานข้อมูลทดสอบแยกที่ชื่อต้องขึ้นต้น `harbor_test`:

```bash
.venv/bin/python -m pip install -r requirements-cloud-tests.txt
HARBOR_TEST_DSN='host=127.0.0.1 port=6543 dbname=harbor_test user=YOUR_TEST_USER' .venv/bin/python -m unittest tests.test_supabase -v
CHROMIUM_PATH=/usr/bin/chromium HARBOR_TEST_DSN='host=127.0.0.1 port=6543 dbname=harbor_test user=YOUR_TEST_USER' .venv/bin/python tests/browser_cloud.py
```

Browser E2E ใช้ static site ใต้ project subpath และ PostgreSQL RPC จริงในสิทธิ์ anon ผ่าน local test gateway ไม่ได้อ้างว่าเชื่อม Supabase ที่ host จริงสำเร็จก่อนผู้ใช้สร้างโปรเจกต์

หลังแก้หน้าเว็บ ให้สร้างไฟล์สำหรับเผยแพร่ใหม่แล้ว commit source พร้อม docs:

```bash
python scripts/build_pages.py --output docs
```

โค้ด Python/FastAPI/SQLite เดิมยังอยู่สำหรับรันในเครื่องและ regression tests ไม่ใช่ backend ของรุ่น GitHub Pages ไม่มีการย้ายข้อมูล SQLite เดิมขึ้น Supabase อัตโนมัติ ให้นำเข้า Excel หลังเชื่อมพื้นที่ทำงานจริง
