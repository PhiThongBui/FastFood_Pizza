# Fastfood Deployment Roadmap

Muc tieu: luyen deploy va van hanh Fastfood theo nhom cong nghe trong JD: Ubuntu VPS, Nginx, PM2/Docker, PostgreSQL, S3-compatible storage, backup, log, SSL va hardening bao mat.

Trang thai hien tai:

- Front-end: Vite + React, dang deploy Vercel.
- Back-end: NestJS, da co `Dockerfile`, dang deploy Koyeb.
- Database: PostgreSQL.
- Cache/realtime: Redis + Socket.IO.
- Upload: dang luu local trong thu muc `uploads` va serve qua `/uploads`.

## Giai Doan 0 - Chuan Bi

- [x] Chot domain/subdomain production.
  - Note: Da co domain. Chua cau hinh DNS/subdomain production.
- [x] Chot VPS provider de luyen deploy: DigitalOcean, Hetzner, Vultr, AWS EC2, Google Compute Engine, Azure VM hoac mot VPS Viet Nam.
  - Note: Da chon VPS Viet Nam goi ST Silver 1 Core, 2 GB RAM, 25 GB SSD.
- [x] Tao VPS Ubuntu 22.04/24.04 LTS.
  - Note: Da tao VPS Ubuntu Server 24.04.
- [ ] Tao SSH key va tat dang nhap password neu co the.
  - Note: Da tao user `deploy`, cap quyen sudo, tao SSH key tren may local va them public key vao `/home/deploy/.ssh/authorized_keys`. Chua tat password login de tranh tu khoa VPS trong luc setup.
- [x] Mo firewall toi thieu: `22`, `80`, `443`.
  - Note: Da bat UFW, default deny incoming, allow OpenSSH, 80/tcp, 443/tcp.
- [x] Cai Docker va Docker Compose plugin tren VPS.
  - Note: Docker 29.0.0 va Docker Compose v5.6.0 da cai thanh cong; `docker run hello-world` pass.
- [x] Kiem tra bien moi truong production cua BE.
  - Note: Da lay danh sach key tu `.env`, khong dua secret vao tai lieu.
- [x] Tao file `.env.production.example` khong chua secret that.
  - Note: Da tao file mau cho Docker Compose production.
- [ ] Tao file `.env.production` tren VPS tu `.env.production.example`.
  - Note: Dien secret that tren VPS, khong commit file nay.

## Giai Doan 1 - Docker Compose Production

Muc tieu: chay duoc stack production tren VPS bang Docker Compose.

- [x] Tao `docker-compose.prod.yml`.
  - Service can co: `api`, `postgres`, `redis`.
  - Note: Da tao compose gom `api`, `postgres`, `redis`; API bind local `127.0.0.1:8000` de sau nay di qua Nginx. Mac dinh compose doc `.env.production`.
- [x] Cau hinh volume cho PostgreSQL data.
  - Note: Da tao named volume `fastfood_postgres_data`.
- [x] Cau hinh volume cho `uploads` neu van dung local upload.
  - Note: Da tao named volume `fastfood_uploads` mount vao `/app/uploads`.
- [x] Set `PORT=8000` cho backend.
  - Note: Da co trong `.env.production.example`.
- [x] Set `DB_HOST=postgres` khi backend chay trong Docker network.
  - Note: Da co trong `.env.production.example`; them `DB_SSL=false` de ket noi Postgres noi bo Docker.
- [x] Set `REDIS_HOST=redis` khi backend chay trong Docker network.
  - Note: Da co trong `.env.production.example`; them `REDIS_TLS=false` de ket noi Redis noi bo Docker.
- [ ] Build image backend thanh cong tren VPS.
  - Lenh tham khao: `docker compose --env-file .env.production -f docker-compose.prod.yml build`
  - Note: Chua build Docker image tren VPS; da test `npm run build` local thanh cong. Thu build Docker local bi chan vi Docker Desktop/daemon chua chay.
- [ ] Chay stack thanh cong.
  - Lenh tham khao: `docker compose --env-file .env.production -f docker-compose.prod.yml up -d`
  - Note:
- [ ] Kiem tra log backend.
  - Lenh tham khao: `docker compose --env-file .env.production -f docker-compose.prod.yml logs -f api`
  - Note:
- [ ] Kiem tra API health/manual endpoint.
  - Note:

## Giai Doan 2 - Nginx Reverse Proxy Va SSL

Muc tieu: public backend qua HTTPS, dung pattern Ubuntu + Nginx nhu JD.

- [ ] Tro DNS `api.your-domain.com` ve IP VPS.
  - Note:
- [ ] Cai Nginx tren VPS.
  - Note:
- [ ] Tao Nginx server block cho backend.
  - Proxy target: `http://127.0.0.1:8000`
  - Note:
- [ ] Cau hinh header cho WebSocket/Socket.IO.
  - Can co: `Upgrade`, `Connection`, `Host`, `X-Forwarded-*`.
  - Note:
- [ ] Test Nginx config.
  - Lenh tham khao: `sudo nginx -t`
  - Note:
- [ ] Reload Nginx.
  - Lenh tham khao: `sudo systemctl reload nginx`
  - Note:
- [ ] Cai Certbot.
  - Note:
- [ ] Cap SSL cho `api.your-domain.com`.
  - Note:
- [ ] Kiem tra API qua HTTPS.
  - Note:

## Giai Doan 3 - Front-end Ket Noi Backend Moi

Muc tieu: FE Vercel goi ve backend tren VPS thay vi Koyeb.

- [ ] Set bien `VITE_BASE_URL=https://api.your-domain.com/api/v1` tren Vercel.
  - Note:
- [ ] Set `FRONTEND_URL=https://your-frontend-domain.com` trong backend.
  - Note:
- [ ] Cap nhat CORS backend neu can.
  - Note:
- [ ] Deploy lai FE.
  - Note:
- [ ] Test login/register.
  - Note:
- [ ] Test gio hang/order.
  - Note:
- [ ] Test upload/anh san pham.
  - Note:
- [ ] Test Socket.IO/chat/realtime neu co.
  - Note:

## Giai Doan 4 - GitHub CI/CD Vao VPS

Muc tieu: push code len GitHub la VPS tu deploy lai.

- [ ] Tao user deploy rieng tren VPS.
  - Note:
- [ ] Tao SSH key cho GitHub Actions.
  - Note:
- [ ] Them secrets vao GitHub repository.
  - Goi y: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`.
  - Note:
- [ ] Tao workflow `.github/workflows/deploy-backend.yml`.
  - Note:
- [ ] Workflow SSH vao VPS.
  - Note:
- [ ] Workflow pull code moi.
  - Note:
- [ ] Workflow chay build va restart Docker Compose.
  - Note:
- [ ] Them buoc health check sau deploy.
  - Note:
- [ ] Test deploy bang mot commit nho.
  - Note:

## Giai Doan 5 - Backup PostgreSQL Va Uploads

Muc tieu: co backup hang ngay va biet restore.

- [ ] Tao script backup PostgreSQL bang `pg_dump`.
  - Note:
- [ ] Tao script nen thu muc `uploads`.
  - Note:
- [ ] Dat ten backup co timestamp.
  - Vi du: `fastfood-db-YYYY-MM-DD-HH-mm.sql.gz`
  - Note:
- [ ] Luu backup local tam thoi trong thu muc rieng.
  - Note:
- [ ] Cau hinh cron chay backup hang ngay.
  - Note:
- [ ] Dong bo backup len S3-compatible storage.
  - Lua chon: AWS S3, Cloudflare R2, Backblaze B2, MinIO.
  - Note:
- [ ] Tu dong xoa backup cu sau N ngay.
  - Note:
- [ ] Test restore database tren moi truong staging/local.
  - Note:
- [ ] Viet tai lieu restore ngan gon.
  - Note:

## Giai Doan 6 - Chuyen Upload Sang S3-Compatible Storage

Muc tieu: khong phu thuoc vao filesystem cua VPS cho anh/file upload.

- [ ] Chon object storage.
  - Goi y de luyen: Cloudflare R2 hoac AWS S3.
  - Note:
- [ ] Tao bucket rieng cho Fastfood.
  - Note:
- [ ] Tao access key co quyen toi thieu.
  - Note:
- [ ] Them bien moi truong S3 vao backend.
  - Goi y: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL`.
  - Note:
- [ ] Cai SDK can thiet.
  - Note:
- [ ] Sua luong upload de day file len S3.
  - Note:
- [ ] Luu URL/key cua file vao database.
  - Note:
- [ ] Test upload anh san pham.
  - Note:
- [ ] Test hien thi anh tren FE.
  - Note:
- [ ] Lap ke hoach migrate file cu trong `uploads` len S3.
  - Note:

## Giai Doan 7 - Log, Monitoring Va Van Hanh

Muc tieu: biet ung dung dang song hay chet, loi o dau, deploy co on khong.

- [ ] Cau hinh Docker log rotation.
  - Note:
- [ ] Xem log backend bang Docker Compose.
  - Note:
- [ ] Xem log Nginx access/error.
  - Note:
- [ ] Tao endpoint health check neu chua co.
  - Note:
- [ ] Them uptime monitoring.
  - Goi y: UptimeRobot, Better Stack, Grafana Cloud hoac Healthchecks.io.
  - Note:
- [ ] Them canh bao khi API down.
  - Note:
- [ ] Theo doi CPU/RAM/disk VPS.
  - Note:
- [ ] Theo doi dung luong PostgreSQL va backup.
  - Note:

## Giai Doan 8 - Hardening Bao Mat

Muc tieu: dua app gan hon voi yeu cau production trong JD.

- [ ] CORS chi cho phep domain production can thiet.
  - Note:
- [ ] Bao ve Swagger production hoac tat public Swagger.
  - Note:
- [ ] Them rate limiting cho endpoint nhay cam.
  - Vi du: login, register, reset password, upload, order.
  - Note:
- [ ] Gioi han dung luong file upload.
  - Note:
- [ ] Kiem tra MIME type va extension khi upload.
  - Note:
- [ ] Khong tra ve stack trace cho client production.
  - Note:
- [ ] Kiem tra JWT secret va token expiry.
  - Note:
- [ ] Kiem tra cookie flags neu dung cookie.
  - Goi y: `httpOnly`, `secure`, `sameSite`.
  - Note:
- [ ] Bat firewall va chi expose port can thiet.
  - Note:
- [ ] Cap nhat dependency co lo hong nghiem trong.
  - Note:

## Giai Doan 9 - Phuong An PM2 De So Sanh Voi Docker

Muc tieu: hieu them cach deploy Node.js bang PM2, dung nhu JD neu cong ty khong dung Docker.

- [ ] Cai Node.js LTS tren VPS.
  - Note:
- [ ] Cai PM2.
  - Note:
- [ ] Build backend bang `npm run build`.
  - Note:
- [ ] Chay backend bang PM2.
  - Lenh tham khao: `pm2 start dist/main.js --name fastfood-api`
  - Note:
- [ ] Luu PM2 process list.
  - Note:
- [ ] Cau hinh PM2 startup khi reboot.
  - Note:
- [ ] So sanh PM2 vs Docker Compose.
  - Note:

## Giai Doan 10 - Tai Lieu Hoa

Muc tieu: co tai lieu van hanh dung voi yeu cau JD.

- [ ] Viet `DEPLOYMENT.md`.
  - Noi dung: cach deploy, rollback, xem log, restart service.
  - Note:
- [ ] Viet `BACKUP_RESTORE.md`.
  - Noi dung: backup nam o dau, restore nhu the nao, test restore ra sao.
  - Note:
- [ ] Viet `ENVIRONMENT.md`.
  - Noi dung: danh sach env var va y nghia, khong ghi secret that.
  - Note:
- [ ] Viet checklist xu ly su co.
  - Vi du: API down, database down, full disk, SSL het han, FE bi CORS.
  - Note:
- [ ] Cap nhat README voi kien truc production.
  - Note:

## Uu Tien De Lam Truoc

Thu tu nen lam:

1. Docker Compose production.
2. VPS Ubuntu + Nginx + SSL.
3. FE ket noi backend VPS.
4. CI/CD tu GitHub vao VPS.
5. Backup PostgreSQL va uploads.
6. S3 upload.
7. Monitoring va hardening.
8. Tai lieu hoa.

## Ghi Chu Ca Nhan

- Ngay bat dau:
- VPS da dung:
- Domain da dung:
- Object storage da dung:
- Viec kho nhat gap phai:
- Loi production dau tien da fix:
- Bai hoc rut ra:
