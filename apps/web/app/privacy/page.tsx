import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Chính sách quyền riêng tư | Happy Home Thanh Hóa",
  description:
    "Chính sách quyền riêng tư của nền tảng Happy Home Thanh Hóa — cách thu thập, sử dụng và bảo vệ thông tin cá nhân của khách hàng và sale.",
  alternates: {
    canonical: "https://happyhomethanhhoa.bdsg.land/privacy",
  },
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  const updated = "15/06/2026";
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-[15px] leading-7 text-zinc-800">
      <h1 className="mb-2 text-3xl font-bold">Chính sách quyền riêng tư</h1>
      <p className="mb-8 text-sm text-zinc-500">Cập nhật lần cuối: {updated}</p>

      <p>
        <strong>Công ty Cổ phần Tập đoàn BDSG — Chi nhánh Thanh Hoá</strong>{" "}
        (đại lý phát triển kinh doanh chính thức dự án Shophouse Happy Home Thanh Hóa, sau đây gọi là “chúng tôi”) tôn trọng quyền riêng tư của Quý
        khách và cam kết bảo vệ thông tin cá nhân khi Quý khách sử dụng
        website{" "}
        <a className="text-blue-600 underline" href="https://happyhomethanhhoa.bdsg.land">
          happyhomethanhhoa.bdsg.land
        </a>{" "}
        và các ứng dụng liên quan (“Nền tảng”).
      </p>

      <h2 className="mt-8 text-xl font-semibold">1. Thông tin chúng tôi thu thập</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>
          <strong>Thông tin Quý khách cung cấp:</strong> họ tên, số điện thoại,
          email, nhu cầu tư vấn, nội dung tin nhắn khi đăng ký/đặt lịch xem nhà.
        </li>
        <li>
          <strong>Thông tin tài khoản:</strong> địa chỉ email Google/Facebook
          khi đăng nhập bằng SSO, ID Telegram khi liên kết bot tư vấn.
        </li>
        <li>
          <strong>Thông tin tự động:</strong> địa chỉ IP, loại thiết bị, trình
          duyệt, trang đã xem, thời lượng truy cập (qua cookie và công cụ phân
          tích).
        </li>
        <li>
          <strong>Thông tin từ kênh chat:</strong> nội dung hội thoại qua
          Facebook Messenger, Zalo, Chatwoot, chatbot trên website — dùng để hỗ
          trợ và cải thiện tư vấn.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">2. Mục đích sử dụng thông tin</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>Tư vấn sản phẩm bất động sản, gửi bảng giá, chính sách bán hàng.</li>
        <li>Lên lịch xem nhà, ghép sale phụ trách, gửi xác nhận booking.</li>
        <li>Quản lý tài khoản khách hàng, đại lý F2 và đội ngũ sale.</li>
        <li>
          Gửi email/SMS/Zalo/Telegram thông báo dự án (chỉ khi Quý khách đồng
          ý — có thể huỷ bất kỳ lúc nào).
        </li>
        <li>Phân tích, nâng cao chất lượng dịch vụ và phòng chống gian lận.</li>
        <li>
          Thực hiện nghĩa vụ pháp lý (lưu trữ chứng từ giao dịch, hợp đồng
          theo quy định pháp luật Việt Nam).
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">3. Cơ sở pháp lý xử lý dữ liệu</h2>
      <p className="mt-2">
        Việc xử lý dữ liệu cá nhân dựa trên: (i) sự đồng ý của Quý khách khi
        cung cấp thông tin; (ii) việc thực hiện hợp đồng/giao dịch bất động
        sản; (iii) tuân thủ quy định của pháp luật Việt Nam, bao gồm Nghị định
        13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân.
      </p>

      <h2 className="mt-8 text-xl font-semibold">4. Chia sẻ thông tin</h2>
      <p className="mt-2">
        Chúng tôi không bán thông tin của Quý khách. Thông tin chỉ được chia
        sẻ trong các trường hợp:
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>
          Với chủ đầu tư dự án Happy Home Thanh Hóa (Tập đoàn Vingroup) để
          xử lý đặt cọc, ký hợp đồng mua bán.
        </li>
        <li>
          Với các đại lý phân phối thứ cấp/F2 do BDSG chỉ định (chỉ cho khách
          hàng họ phụ trách).
        </li>
        <li>
          Với nhà cung cấp dịch vụ kỹ thuật (Google Workspace, Railway,
          Cloudflare, Chatwoot, Vercel) — đều có cam kết bảo mật.
        </li>
        <li>Khi cơ quan nhà nước có thẩm quyền yêu cầu hợp pháp.</li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">5. Lưu trữ và bảo mật</h2>
      <p className="mt-2">
        Dữ liệu được lưu tại máy chủ đặt tại khu vực châu Á - Thái Bình Dương
        (Railway, Google Cloud) và được mã hoá khi truyền (HTTPS/TLS 1.2+).
        Thời gian lưu trữ tối thiểu 24 tháng kể từ lần tương tác gần nhất,
        sau đó có thể bị xoá hoặc ẩn danh.
      </p>

      <h2 className="mt-8 text-xl font-semibold">6. Quyền của khách hàng</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>Truy cập, chỉnh sửa, bổ sung thông tin cá nhân của mình.</li>
        <li>Yêu cầu xoá dữ liệu (trừ trường hợp pháp luật yêu cầu lưu giữ).</li>
        <li>Rút lại sự đồng ý hoặc từ chối nhận thông tin tiếp thị.</li>
        <li>
          Khiếu nại về việc xử lý dữ liệu qua email{" "}
          <a className="text-blue-600 underline" href="mailto:info@bdsg.land">
            info@bdsg.land
          </a>
          .
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">7. Cookie</h2>
      <p className="mt-2">
        Chúng tôi sử dụng cookie để duy trì phiên đăng nhập, ghi nhớ tuỳ chọn
        ngôn ngữ và phân tích lượt truy cập. Quý khách có thể tắt cookie trong
        cài đặt trình duyệt — một số tính năng có thể không hoạt động đầy đủ.
      </p>

      <h2 className="mt-8 text-xl font-semibold">8. Trẻ em</h2>
      <p className="mt-2">
        Nền tảng không hướng đến người dưới 16 tuổi. Nếu phát hiện trẻ em đã
        cung cấp thông tin, chúng tôi sẽ xoá ngay khi nhận được yêu cầu của
        người giám hộ hợp pháp.
      </p>

      <h2 className="mt-8 text-xl font-semibold">9. Thay đổi chính sách</h2>
      <p className="mt-2">
        Chính sách có thể được cập nhật để phù hợp với quy định pháp luật và
        thực tế vận hành. Phiên bản mới có hiệu lực ngay khi đăng tại URL này;
        Quý khách nên kiểm tra định kỳ.
      </p>

      <h2 className="mt-8 text-xl font-semibold">10. Liên hệ</h2>
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
