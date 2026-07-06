import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Xoá dữ liệu người dùng | Happy Home Thanh Hóa",
  description:
    "Hướng dẫn yêu cầu xoá dữ liệu người dùng khỏi nền tảng Happy Home Thanh Hóa — đáp ứng yêu cầu của Facebook App, Zalo OA và quy định bảo vệ dữ liệu cá nhân.",
  alternates: {
    canonical: "https://happyhomethanhhoa.bdsg.land/data-deletion",
  },
  robots: { index: true, follow: true },
};

export default function DataDeletionPage() {
  const updated = "15/06/2026";
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-[15px] leading-7 text-zinc-800">
      <h1 className="mb-2 text-3xl font-bold">Xoá dữ liệu người dùng</h1>
      <p className="mb-8 text-sm text-zinc-500">Cập nhật lần cuối: {updated}</p>

      <p>
        <strong>Công ty Cổ phần Tập đoàn BDSG — Chi nhánh Thanh Hoá</strong>{" "}
        (đại lý phát triển kinh doanh chính thức dự án Shophouse Happy Home Thanh Hóa, sau đây gọi là “chúng tôi”) cam kết hỗ trợ Quý khách thực hiện
        quyền yêu cầu xoá dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP về bảo
        vệ dữ liệu cá nhân và yêu cầu của các nền tảng kết nối (Facebook,
        Zalo, Google).
      </p>

      <h2 className="mt-8 text-xl font-semibold">1. Dữ liệu sẽ được xoá</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>Họ tên, số điện thoại, email, địa chỉ.</li>
        <li>Lịch sử hội thoại chatbot, Messenger, Zalo, Telegram.</li>
        <li>Lịch đặt hẹn xem nhà, lịch sử tư vấn.</li>
        <li>Hồ sơ khách hàng (CRM lead, customer 360).</li>
        <li>
          Tokens đăng nhập (Google, Facebook, Telegram) và phiên hoạt động.
        </li>
        <li>Cookie và dữ liệu phân tích gắn với tài khoản.</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">2. Dữ liệu KHÔNG xoá</h2>
      <p className="mt-2">
        Theo quy định pháp luật, một số dữ liệu sau buộc phải lưu trong thời
        hạn nhất định:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>
          Chứng từ giao dịch đặt cọc/hợp đồng mua bán (lưu tối thiểu 5 năm
          theo Luật Kế toán).
        </li>
        <li>
          Hoá đơn, chứng từ thuế (lưu theo quy định Bộ Tài chính).
        </li>
        <li>
          Bằng chứng/log phục vụ điều tra (nếu cơ quan nhà nước yêu cầu hợp
          pháp).
        </li>
      </ul>
      <p className="mt-2">
        Các dữ liệu này sẽ được ẩn danh hoá (gỡ tên/SĐT/email), chỉ giữ phần
        bắt buộc theo pháp luật.
      </p>

      <h2 className="mt-8 text-xl font-semibold">3. Cách yêu cầu xoá dữ liệu</h2>

      <h3 className="mt-4 text-lg font-semibold">Cách 1 — Tự xoá trong tài khoản</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-6">
        <li>
          Đăng nhập tại{" "}
          <a className="text-blue-600 underline" href="https://happyhomethanhhoa.bdsg.land/login">
            happyhomethanhhoa.bdsg.land/login
          </a>
          .
        </li>
        <li>Vào mục <strong>Tài khoản → Cài đặt → Xoá tài khoản</strong>.</li>
        <li>Nhập lý do (tuỳ chọn) → bấm <strong>Xoá vĩnh viễn</strong>.</li>
        <li>
          Tài khoản và dữ liệu liên kết sẽ bị xoá trong vòng 30 ngày làm việc.
        </li>
      </ol>

      <h3 className="mt-6 text-lg font-semibold">Cách 2 — Gửi yêu cầu qua email</h3>
      <p className="mt-2">
        Quý khách gửi email đến{" "}
        <a className="text-blue-600 underline" href="mailto:info@bdsg.land?subject=Y%C3%AAu%20c%E1%BA%A7u%20xo%C3%A1%20d%E1%BB%AF%20li%E1%BB%87u%20c%C3%A1%20nh%C3%A2n">
          info@bdsg.land
        </a>{" "}
        với:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>
          <strong>Tiêu đề:</strong> “Yêu cầu xoá dữ liệu cá nhân”
        </li>
        <li>
          <strong>Nội dung:</strong> họ tên, số điện thoại/email đã đăng ký,
          xác nhận quyền sở hữu tài khoản.
        </li>
        <li>
          <strong>Đính kèm:</strong> CCCD/CMND mặt trước (che 6 số cuối) để
          xác minh danh tính — KHÔNG bắt buộc nhưng giúp xử lý nhanh.
        </li>
      </ul>
      <p className="mt-2">
        Chúng tôi sẽ phản hồi trong vòng <strong>72 giờ làm việc</strong> và
        hoàn tất xoá trong vòng <strong>30 ngày</strong>.
      </p>

      <h3 className="mt-6 text-lg font-semibold">Cách 3 — Yêu cầu từ Facebook</h3>
      <p className="mt-2">
        Nếu Quý khách đăng nhập bằng Facebook và muốn rút lại quyền truy cập:
      </p>
      <ol className="mt-2 list-decimal space-y-1 pl-6">
        <li>
          Vào{" "}
          <a className="text-blue-600 underline" href="https://www.facebook.com/settings?tab=applications">
            Facebook → Cài đặt → Ứng dụng và trang web
          </a>
          .
        </li>
        <li>
          Tìm <strong>“Happy Home Thanh Hóa”</strong> trong danh sách ứng
          dụng.
        </li>
        <li>Bấm <strong>Xoá</strong>.</li>
        <li>
          Facebook sẽ gửi yêu cầu xoá data đến hệ thống chúng tôi qua callback;
          chúng tôi xác nhận và xoá trong vòng 30 ngày.
        </li>
      </ol>
      <p className="mt-2 text-sm text-zinc-600">
        Mã yêu cầu (confirmation_code) sẽ được trả về cho Facebook để theo
        dõi tiến độ. Quý khách có thể tra cứu trạng thái bằng cách email cho
        chúng tôi kèm mã code.
      </p>

      <h3 className="mt-6 text-lg font-semibold">Cách 4 — Yêu cầu qua Zalo / Hotline</h3>
      <p className="mt-2">
        Nhắn tin yêu cầu xoá dữ liệu qua Zalo OA Happy Home Thanh Hóa hoặc
        gọi hotline{" "}
        <a className="text-blue-600 underline" href="tel:0967806686">
          0967 806 686
        </a>
        . CSKH sẽ tiếp nhận và xác minh danh tính trước khi xử lý.
      </p>

      <h2 className="mt-8 text-xl font-semibold">4. Sau khi xoá</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>Tài khoản đăng nhập không còn truy cập được.</li>
        <li>
          Lịch sử chat, lead, booking gắn với tài khoản sẽ bị xoá vĩnh viễn
          (trừ dữ liệu pháp lý phải giữ).
        </li>
        <li>
          Email/SĐT có thể được giữ trong danh sách “không gửi” (suppression
          list) để bảo đảm chúng tôi KHÔNG vô tình liên hệ lại.
        </li>
        <li>
          Quý khách có thể đăng ký lại tài khoản mới bất kỳ lúc nào.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">5. Liên hệ Data Protection Officer</h2>
      <p className="mt-2">
        Mọi câu hỏi liên quan đến quyền dữ liệu cá nhân, vui lòng liên hệ:
      </p>
      <p className="mt-2">
        <strong>Công ty Cổ phần Tập đoàn BDSG — Chi nhánh Thanh Hoá</strong>
        <br />
        Đại lý phát triển kinh doanh dự án Shophouse Happy Home Thanh Hóa
        <br />
        Địa chỉ: Phường Hạc Thành, tỉnh Thanh Hóa
        <br />
        Email:{" "}
        <a className="text-blue-600 underline" href="mailto:info@bdsg.land">
          info@bdsg.land
        </a>
        <br />
        Hotline:{" "}
        <a className="text-blue-600 underline" href="tel:0967806686">
          0967 806 686
        </a>
        <br />
        Website:{" "}
        <a className="text-blue-600 underline" href="https://happyhomethanhhoa.bdsg.land">
          https://happyhomethanhhoa.bdsg.land
        </a>
      </p>
    </main>
  );
}
