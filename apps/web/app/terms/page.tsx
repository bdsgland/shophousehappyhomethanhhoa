import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Điều khoản dịch vụ | Happy Home Thanh Hóa",
  description:
    "Điều khoản dịch vụ của nền tảng Happy Home Thanh Hóa — quy định sử dụng website, ứng dụng, dịch vụ tư vấn và đặt lịch xem nhà.",
  alternates: {
    canonical: "https://happyhomethanhhoa.bdsg.land/terms",
  },
  robots: { index: true, follow: true },
};

export default function TermsOfServicePage() {
  const updated = "15/06/2026";
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 text-[15px] leading-7 text-zinc-800">
      <h1 className="mb-2 text-3xl font-bold">Điều khoản dịch vụ</h1>
      <p className="mb-8 text-sm text-zinc-500">Cập nhật lần cuối: {updated}</p>

      <p>
        Vui lòng đọc kỹ Điều khoản dịch vụ (“Điều khoản”) này trước khi sử dụng
        website{" "}
        <a className="text-blue-600 underline" href="https://happyhomethanhhoa.bdsg.land">
          happyhomethanhhoa.bdsg.land
        </a>{" "}
        và các ứng dụng do <strong>Công ty Cổ phần Tập đoàn BDSG — Chi nhánh
        Thanh Hoá</strong> (đại lý phát triển kinh doanh chính thức dự án Shophouse Happy Home Thanh Hóa, sau đây gọi là “chúng tôi”) cung cấp (“Nền
        tảng”). Khi truy cập hoặc sử dụng Nền tảng, Quý khách (“người dùng”)
        đồng ý chịu sự ràng buộc bởi các Điều khoản dưới đây.
      </p>

      <h2 className="mt-8 text-xl font-semibold">1. Phạm vi dịch vụ</h2>
      <p className="mt-2">
        Nền tảng cung cấp thông tin về dự án bất động sản Shophouse Happy Home Thanh Hóa (do Tập đoàn Vingroup làm chủ đầu tư) và các dịch vụ phân phối
        do BDSG — Chi nhánh Thanh Hoá triển khai với vai trò đại lý phát triển kinh doanh: tiện ích đặt lịch tư vấn, ghép sale tư vấn trực tuyến, đăng ký
        đại lý phân phối thứ cấp F2, cổng quản trị và các công cụ AI hỗ trợ.
        Mọi giao dịch đặt cọc/mua bán bất động sản được thực hiện qua hợp
        đồng riêng giữa khách hàng với chủ đầu tư và các bên uỷ quyền hợp
        pháp.
      </p>

      <h2 className="mt-8 text-xl font-semibold">2. Tài khoản người dùng</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>
          Quý khách phải đủ 18 tuổi và có năng lực hành vi dân sự đầy đủ để
          mở tài khoản.
        </li>
        <li>
          Thông tin đăng ký phải chính xác, đầy đủ và được cập nhật khi có
          thay đổi.
        </li>
        <li>
          Quý khách chịu trách nhiệm bảo mật mật khẩu, mã OTP, token đăng
          nhập; chúng tôi không chịu trách nhiệm về thiệt hại do tài khoản bị
          chia sẻ/lộ lọt do lỗi của người dùng.
        </li>
        <li>
          Mỗi cá nhân chỉ nên dùng một tài khoản; đại lý F2 dùng tài khoản
          riêng và liên kết về sàn của mình.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">3. Hành vi bị cấm</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>Cung cấp thông tin sai, giả mạo danh tính người khác.</li>
        <li>
          Sử dụng bot/script để tự động khai thác dữ liệu, gây quá tải hệ
          thống.
        </li>
        <li>
          Sao chép, phát tán nội dung của Nền tảng (hình ảnh dự án, bảng giá,
          tài liệu) khi chưa được chúng tôi đồng ý bằng văn bản.
        </li>
        <li>
          Spam tin nhắn, gọi điện làm phiền khách hàng/sale khác.
        </li>
        <li>
          Cung cấp thông tin sai lệch về dự án nhằm trục lợi (đối với sale,
          đại lý F2 — vi phạm sẽ bị đình chỉ tài khoản và xử lý theo cam kết).
        </li>
        <li>
          Vi phạm pháp luật Việt Nam liên quan đến kinh doanh bất động sản,
          quảng cáo, bảo vệ người tiêu dùng, an toàn thông tin.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">4. Quy định cho Sale và Đại lý F2</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>
          Sale/F2 chỉ được sử dụng dữ liệu khách hàng do hệ thống phân giao
          để phục vụ tư vấn; nghiêm cấm chia sẻ ra bên thứ ba.
        </li>
        <li>
          Hoa hồng được tính theo cơ chế bậc KPI luỹ tiến công bố trong cổng
          sale. Mọi giao dịch phải đi qua hệ thống để được ghi nhận.
        </li>
        <li>
          Trường hợp tự huỷ giao dịch, lừa đảo khách hàng → bị khoá tài khoản,
          khoá hoa hồng và xử lý theo quy định công ty.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">5. Quyền sở hữu trí tuệ</h2>
      <p className="mt-2">
        Toàn bộ thiết kế, mã nguồn, hình ảnh, tài liệu trên Nền tảng thuộc
        quyền sở hữu của Happy Home Thanh Hóa hoặc bên cấp phép. Mọi hành vi
        sao chép, sửa đổi, phân phối khi chưa có sự đồng ý bằng văn bản là vi
        phạm và sẽ bị xử lý theo luật sở hữu trí tuệ Việt Nam.
      </p>

      <h2 className="mt-8 text-xl font-semibold">6. Miễn trừ trách nhiệm</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>
          Thông tin trên Nền tảng được cập nhật thường xuyên nhưng có thể có
          sai sót/thay đổi; thông tin chính thức luôn là tài liệu do chủ đầu
          tư cung cấp tại thời điểm ký hợp đồng.
        </li>
        <li>
          Các tính năng AI (chatbot, tư vấn, gợi ý) chỉ mang tính tham khảo,
          không thay thế tư vấn pháp lý hay tài chính chuyên sâu.
        </li>
        <li>
          Nền tảng có thể bị gián đoạn do bảo trì, sự cố nhà cung cấp hạ tầng
          (Railway, Vercel, Cloudflare, Google) — chúng tôi không chịu thiệt
          hại gián tiếp phát sinh ngoài tầm kiểm soát.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold">7. Đặt cọc, thanh toán và huỷ</h2>
      <p className="mt-2">
        Các giao dịch đặt cọc, thanh toán, ký kết hợp đồng mua bán được thực
        hiện trực tiếp giữa khách hàng và chủ đầu tư dự án Shophouse Happy Home Thanh Hóa (Tập đoàn Vingroup) thông qua BDSG — Chi nhánh Thanh Hoá với
        vai trò đại lý phát triển kinh doanh, theo chính sách bán hàng từng thời kỳ
        do chủ đầu tư ban hành. Phí đặt cọc, lịch thanh toán, điều kiện huỷ
        — vui lòng xem bảng giá và hợp đồng cụ thể. Nền tảng không thay thế
        hợp đồng kinh tế giữa các bên.
      </p>

      <h2 className="mt-8 text-xl font-semibold">8. Chấm dứt và đình chỉ</h2>
      <p className="mt-2">
        Chúng tôi có quyền tạm dừng hoặc chấm dứt tài khoản nếu phát hiện vi
        phạm Điều khoản này, vi phạm pháp luật hoặc có dấu hiệu gian lận.
        Trường hợp tài khoản bị đình chỉ, hoa hồng/chiết khấu chưa thanh toán
        có thể bị giữ lại để đối chiếu.
      </p>

      <h2 className="mt-8 text-xl font-semibold">9. Sửa đổi Điều khoản</h2>
      <p className="mt-2">
        Chúng tôi có quyền sửa đổi Điều khoản này. Phiên bản mới có hiệu lực
        ngay khi đăng tại URL này. Việc Quý khách tiếp tục sử dụng Nền tảng
        sau khi cập nhật được hiểu là chấp nhận Điều khoản mới.
      </p>

      <h2 className="mt-8 text-xl font-semibold">10. Luật áp dụng và giải quyết tranh chấp</h2>
      <p className="mt-2">
        Điều khoản này được điều chỉnh bởi pháp luật nước Cộng hoà Xã hội Chủ
        nghĩa Việt Nam. Tranh chấp phát sinh sẽ được hai bên thương lượng;
        nếu không thoả thuận được, sẽ giải quyết tại Toà án có thẩm quyền nơi
        chúng tôi đặt trụ sở.
      </p>

      <h2 className="mt-8 text-xl font-semibold">11. Liên hệ</h2>
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
