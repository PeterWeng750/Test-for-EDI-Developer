# นำ Harbor ขึ้น Render

## สิ่งที่ต้องเตรียม

- บัญชี Render ที่เชื่อมต่อ GitHub repository นี้
- Commit/push โค้ดจากชุดส่งมอบเข้า repository ก่อนสร้างบริการ (ไฟล์ข้อมูลจริงและฐานข้อมูลไม่อยู่ในชุดส่งมอบ)
- เลือกแพ็กเกจ Web Service ที่รองรับ Persistent Disk; `render.yaml` ระบุ Starter และ disk 1 GB ตรวจสอบราคาปัจจุบันใน Render ก่อนยืนยัน ค่าใช้จ่ายจะเริ่มตามแพ็กเกจที่เลือก

## ขั้นตอน

1. สร้างบัญชีที่ https://render.com แล้วเชื่อม GitHub repository `PeterWeng750/Test-for-EDI-Developer` ที่มีโค้ดชุดนี้
2. ใน Render เลือก **New → Blueprint** แล้วเลือก repository และ branch ที่มีโค้ด
3. ตรวจค่าใน `render.yaml`: runtime Python, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT --workers 1 --proxy-headers`, `DATA_DIR=/var/data`, disk mount `/var/data`
4. ยืนยันสร้างบริการ เมื่อสถานะเป็น Live ใช้ URL จริงที่ Render แสดง ซึ่งลงท้าย `.onrender.com` เป็นลิงก์แชร์ ไม่มี URL สาธารณะที่สร้างไว้ในโค้ดนี้
5. ตรวจ `/api/health` ที่ URL นั้น ต้องได้ `status: ok` เปิดหน้าเว็บและอัปโหลด **ข้อมูลสมมติ** ที่สร้างด้วย `scripts/make_demo.py` บนเครื่องก่อน
6. เปิดลิงก์ในเบราว์เซอร์อีกตัว ทดสอบว่าทั้งคู่เห็นข้อมูลเดียวกัน กรองและ Export Excel/CSV และใช้ Print → Save as PDF
7. Restart บริการแล้วตรวจว่าข้อมูลยังอยู่ เพื่อยืนยัน disk บน Render จริง ก่อนนำเข้าข้อมูลใช้งาน

## หากสร้าง Web Service ด้วยตัวเอง

ใช้ค่าจาก `render.yaml` และเพิ่ม Persistent Disk ในหน้าตั้งค่าบริการ อย่าบันทึกฐานข้อมูลไว้เฉพาะ filesystem ชั่วคราวของ container ต้องกำหนด `DATA_DIR` ตรงกับ mount path ของ disk ใช้หนึ่ง instance เท่านั้นสำหรับ SQLite นี้

## ข้อควรทราบของลิงก์ร่วมกัน

ผู้ถือ URL ดูและ Export ข้อมูล รวมถึงเพิ่มและอัปเดตผ่าน Excel ได้ทั้งหมด ไม่มี PIN ตามขอบเขตที่ยึดใช้ อย่าใส่ข้อมูลจริงใน GitHub หรือ Docker image และอย่าอัปโหลดไฟล์จริงเพื่อเป็น demo สาธารณะโดยไม่ต้องการให้ผู้ถือ URL เห็น

Persistent Disk ช่วยให้ข้อมูลอยู่หลัง restart/deploy แต่ควรสำรองแยกด้วย `scripts/backup.py` ไม่ถือว่าการเก็บบน disk เดียวเป็นการสำรองครบถ้วน

## สถานะการส่งมอบ

โค้ดและคำสั่งทดสอบทำงานในสภาพแวดล้อมพัฒนาแล้ว ส่วน Blueprint ยังต้อง Deploy ในบัญชี Render ของผู้ใช้ ยังไม่มีการยืนยัน build, persistent disk หรือ URL สาธารณะบน Render จนกว่าจะทำขั้นตอนข้างต้นสำเร็จ
