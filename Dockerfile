# STAGE 1: Cài đặt dependencies đầy đủ
FROM node:22-slim AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

# STAGE 2: Build source code(build và dọn rác)
FROM node:22-slim AS builder

# đặt thư mục mặc định làm việc trong container là app
WORKDIR /app

# copy thư mục nodemodule từ stage deps sang
COPY --from=deps /app/node_modules ./node_modules
# copy toàn bộ mã nguồn của dự án máy tính vào container
COPY . .

# chay lệnh build tạo ra thư mục dist
# và dọn rác sau khi build(devDependencies như TypeScript, linter, test tool,..)
RUN npm run build
RUN npm prune --omit=dev


# STAGE 3: Image sản phẩm chạy thực tế
FROM node:22-slim AS runner

#  Đặt biến môi trường chỉ định ứng dụng chạy ở production
ENV NODE_ENV=production 
WORKDIR /app

# Nhặt những file cần thiết từ builder mang sang

# thông tin dự án
COPY package*.json ./ 
# dependence production đã dọn dẹp ở trên
COPY --from=builder /app/node_modules ./node_modules
# mã nguồn JS đã biên dịch
COPY --from=builder /app/dist ./dist
# các file mẫu không nằm trong tiến trình build của ts
COPY --from=builder /app/src/templates ./src/templates

# tạo thư mục lưu trữ file người dùng tải lên
RUN mkdir -p uploads
# Container lắng nghe tín hiệu ở cổng 8000
EXPOSE 8000

CMD ["node", "dist/main.js"]
