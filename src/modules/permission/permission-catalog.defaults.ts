export const DEFAULT_PERMISSION_GROUPS = [
  {
    key: 'dashboard',
    label: 'Tổng quan',
    description:
      'Theo dõi số liệu, checklist và truy cập nhanh trong khu vực admin',
    permissions: [
      {
        value: 'DASHBOARD_VIEW',
        label: 'Xem tổng quan',
        description:
          'Xem doanh thu, đơn đang xử lý, hoạt động gần đây và checklist vận hành',
      },
      {
        value: 'DASHBOARD_STATISTICS_VIEW',
        label: 'Xem thống kê vận hành',
        description:
          'Xem thống kê doanh thu, trạng thái đơn, thanh toán và sản phẩm bán chạy',
      },
    ],
  },
  {
    key: 'products',
    label: 'Sản phẩm',
    description: 'Quản lý món, giá, trạng thái bán và hình ảnh sản phẩm',
    permissions: [
      {
        value: 'PRODUCT_VIEW',
        label: 'Xem sản phẩm',
        description:
          'Xem danh sách, lọc, tìm kiếm và chi tiết sản phẩm trong admin',
      },
      {
        value: 'PRODUCT_CREATE',
        label: 'Thêm sản phẩm',
        description: 'Tạo món mới, biến thể, giá bán và trạng thái hiển thị',
      },
      {
        value: 'PRODUCT_UPDATE',
        label: 'Cập nhật sản phẩm',
        description:
          'Sửa tên, mô tả, giá, danh mục, biến thể và trạng thái bán',
      },
      {
        value: 'PRODUCT_IMAGE_UPLOAD',
        label: 'Tải ảnh sản phẩm',
        description: 'Upload hoặc thay đổi hình ảnh đại diện cho sản phẩm',
      },
    ],
  },
  {
    key: 'categories',
    label: 'Danh mục',
    description: 'Sắp xếp nhóm món, combo và bộ sưu tập trên menu',
    permissions: [
      {
        value: 'CATEGORY_VIEW',
        label: 'Xem danh mục',
        description: 'Xem danh sách, bộ lọc và trạng thái danh mục menu',
      },
      {
        value: 'CATEGORY_CREATE',
        label: 'Thêm danh mục',
        description: 'Tạo danh mục mới cho nhóm món hoặc bộ sưu tập',
      },
      {
        value: 'CATEGORY_UPDATE',
        label: 'Cập nhật danh mục',
        description: 'Sửa tên, mô tả, thứ tự hiển thị và trạng thái danh mục',
      },
    ],
  },
  {
    key: 'orders',
    label: 'Đơn hàng',
    description: 'Theo dõi, lọc và cập nhật trạng thái đơn hàng',
    permissions: [
      {
        value: 'ORDER_VIEW',
        label: 'Xem đơn hàng',
        description:
          'Xem danh sách, chi tiết, khách hàng, món đặt và thanh toán',
      },
      {
        value: 'ORDER_STATUS_UPDATE',
        label: 'Cập nhật trạng thái đơn',
        description:
          'Đổi trạng thái chờ xử lý, đang chuẩn bị, sẵn sàng, đã giao hoặc đã hủy',
      },
      {
        value: 'ORDER_STATISTICS_VIEW',
        label: 'Xem thống kê đơn',
        description:
          'Xem tổng quan doanh thu, trạng thái đơn, thanh toán và đơn gần đây',
      },
    ],
  },
  {
    key: 'dineIn',
    label: 'Tại quán',
    description: 'Bàn QR, phiên gọi món, ticket bếp và thanh toán tại quầy',
    permissions: [
      {
        value: 'DINE_IN_ORDER_VIEW',
        label: 'Xem đơn tại quán',
        description: 'Xem phiên bàn, ticket bếp và các đơn phát sinh tại quán',
      },
      {
        value: 'DINE_IN_ORDER_CREATE',
        label: 'Gọi món tại bàn',
        description: 'Mở phiên, thêm món, gửi ticket và cập nhật bếp',
      },
      {
        value: 'DINE_IN_TABLE_MANAGE',
        label: 'Quản lý bàn QR',
        description: 'Tạo, sửa, khóa bàn và tạo lại mã QR',
      },
      {
        value: 'DINE_IN_KITCHEN_UPDATE',
        label: 'Cập nhật bếp',
        description: 'Đổi trạng thái ticket bếp trong luồng phục vụ tại quán',
      },
      {
        value: 'DINE_IN_PAYMENT_CONFIRM',
        label: 'Thanh toán tại quầy',
        description: 'Xác nhận tiền mặt, tạo QR SePay và chốt phiên bàn',
      },
    ],
  },
  {
    key: 'messages',
    label: 'Tin nhắn',
    description: 'Support khách hàng và quản lý mẫu trả lời nhanh',
    permissions: [
      {
        value: 'CHAT_VIEW',
        label: 'Xem tin nhắn',
        description:
          'Xem hội thoại, tin chưa đọc và lịch sử trao đổi với khách',
      },
      {
        value: 'CHAT_REPLY_SEND',
        label: 'Trả lời khách hàng',
        description:
          'Gửi phản hồi từ khu vực admin và đánh dấu hội thoại đã đọc',
      },
      {
        value: 'CHAT_QUICK_REPLY_MANAGE',
        label: 'Quản lý trả lời nhanh',
        description: 'Tạo, sửa và xóa mẫu phản hồi nhanh cho đội vận hành',
      },
    ],
  },
  {
    key: 'policies',
    label: 'Chính sách',
    description: 'Thiết lập quy tắc hủy đơn, giao hàng, thanh toán và hỗ trợ',
    permissions: [
      {
        value: 'STORE_POLICY_VIEW',
        label: 'Xem chính sách',
        description: 'Xem cấu hình chính sách hiện tại của quán',
      },
      {
        value: 'STORE_POLICY_UPDATE',
        label: 'Cập nhật chính sách',
        description:
          'Sửa quy tắc hủy đơn, thông tin quán và nội dung chính sách hiển thị',
      },
    ],
  },
  {
    key: 'cartAddOns',
    label: 'Gợi ý thêm vào đơn',
    description: 'Quản lý danh mục sản phẩm hiển thị trong phần thêm nhanh ở giỏ hàng',
    permissions: [
      {
        value: 'CART_ADD_ON_SETTING_VIEW',
        label: 'Xem cấu hình gợi ý',
        description: 'Xem các danh mục đang được dùng để gợi ý thêm vào đơn hàng',
      },
      {
        value: 'CART_ADD_ON_SETTING_UPDATE',
        label: 'Cập nhật cấu hình gợi ý',
        description: 'Thêm, xóa, bật tắt và sắp xếp danh mục gợi ý trong giỏ hàng',
      },
    ],
  },
  {
    key: 'notifications',
    label: 'Thông báo',
    description: 'Push, email, banner và chiến dịch nội bộ',
    permissions: [
      {
        value: 'NOTIFICATION_VIEW',
        label: 'Xem thông báo',
        description: 'Xem danh sách campaign, kênh gửi, trạng thái và hiệu quả',
      },
      {
        value: 'NOTIFICATION_CREATE',
        label: 'Tạo thông báo',
        description: 'Tạo campaign push, email hoặc banner mới',
      },
      {
        value: 'NOTIFICATION_UPDATE',
        label: 'Cập nhật thông báo',
        description:
          'Sửa nội dung, đối tượng nhận, lịch gửi và trạng thái campaign',
      },
      {
        value: 'NOTIFICATION_SEND',
        label: 'Duyệt và gửi thông báo',
        description:
          'Kích hoạt, duyệt hoặc lên lịch phát thông báo đến khách hàng',
      },
    ],
  },
  {
    key: 'bills',
    label: 'Hóa đơn',
    description: 'Đối soát hóa đơn, nhà cung cấp và dòng tiền',
    permissions: [
      {
        value: 'BILL_VIEW',
        label: 'Xem hóa đơn',
        description:
          'Xem danh sách hóa đơn, kỳ đối soát, hạn thanh toán và số tiền',
      },
      {
        value: 'BILL_CREATE',
        label: 'Tạo hóa đơn',
        description: 'Tạo phiếu đối soát hoặc hóa đơn mới trong admin',
      },
      {
        value: 'BILL_UPDATE',
        label: 'Cập nhật hóa đơn',
        description:
          'Sửa thông tin hóa đơn, kỳ đối soát và trạng thái thanh toán',
      },
      {
        value: 'BILL_APPROVE',
        label: 'Duyệt hóa đơn',
        description: 'Chốt hoặc gửi hóa đơn sang bước xử lý nội bộ',
      },
    ],
  },
  {
    key: 'access',
    label: 'Phân quyền',
    description: 'Vai trò, trạng thái tài khoản và toàn bộ quyền động',
    permissions: [
      {
        value: 'USER_ACCESS_VIEW',
        label: 'Xem phân quyền',
        description: 'Xem danh sách tài khoản, vai trò và quyền đang được cấp',
      },
      {
        value: 'USER_ACCESS_MANAGE',
        label: 'Quản lý phân quyền',
        description:
          'Cập nhật vai trò, trạng thái tài khoản và quyền thao tác động',
      },
    ],
  },
  {
    key: 'account',
    label: 'Tài khoản admin',
    description: 'Hồ sơ cá nhân, ảnh đại diện và bảo mật tài khoản vận hành',
    permissions: [
      {
        value: 'ADMIN_PROFILE_UPDATE',
        label: 'Cập nhật hồ sơ admin',
        description:
          'Sửa tên, số điện thoại, địa chỉ, avatar và thông tin cá nhân',
      },
      {
        value: 'ADMIN_PASSWORD_CHANGE',
        label: 'Đổi mật khẩu admin',
        description: 'Thực hiện luồng đổi mật khẩu cho tài khoản quản trị',
      },
    ],
  },
] as const;
