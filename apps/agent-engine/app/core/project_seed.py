"""Seed mặc định cho dự án Eurowindow Light City (slug eurowindow-light-city).

Chuyển y nguyên nội dung tĩnh từ apps/web/components/dashboard/elc-data.ts sang
ProjectDoc để khi project_store khởi tạo lần đầu KHÔNG mất nội dung đang hiển thị.
Trang web vẫn giữ elc-data.ts làm fallback offline; đây là "bản gốc" trong store
để admin chỉnh và đồng bộ ra sale/khách.

Khi cập nhật nội dung dự án, hãy sửa qua admin (/admin/projects) — KHÔNG sửa file
này (nó chỉ là seed lần đầu).
"""

from __future__ import annotations

from app.schemas.project import (
    Connection,
    Gallery360Section,
    HeroImage,
    KeyValue,
    LocationSection,
    NewsItem,
    NewsSection,
    OverviewSection,
    PolicyCard,
    PolicySection,
    PriceRow,
    ProjectContent,
    ProjectDoc,
    Subzone,
    SubzonesSection,
    TimelineItem,
    TimelineSection,
    Tour360,
    TrainingItem,
    TrainingSection,
)

DEFAULT_SLUG = "eurowindow-light-city"

# ----- Ảnh THẬT (giống elc-data.ts: CDN + D + size-segment) -----
_CDN = "/elc-assets/w.ladicdn.com"
_D = "66bf0ce47123d90013a10b9f"

_IMG = {
    "tongThe": f"{_CDN}/s1440x694/{_D}/4221-20251026174908-3ncoy.jpg",
    "hoangHon": f"{_CDN}/s1440x836/{_D}/pc03_tt-hoang-hon_edit_logo_resize_2-20251022183716-bumkm.jpg",
    "hoangHon2": f"{_CDN}/s750x600/{_D}/pc03_tt-hoang-hon_edit_logo_resize_2-20251026163257-whflk.jpg",
    "daiLoAnhSang": f"{_CDN}/s1440x817/{_D}/pc13_dailoanhsang_edit_logo-copy-20251022182719-77syf.jpg",
    "daiLo2": f"{_CDN}/s1200x850/{_D}/pc13_dailoanhsang_edit_logo-copy-20251028025052-nyrmf.jpg",
    "lkNhat": f"{_CDN}/s768x726/{_D}/pc09_lk-nhat-3-tang_edit_logo-20251022185128-bfolb.jpg",
    "venHo": f"{_CDN}/s1440x832/{_D}/m16-v1-copy-20251025154712-_gqyg.jpg",
    "m16b": f"{_CDN}/s750x600/{_D}/m16-v1-copy-20251026123017-exg88.jpg",
    "ue": f"{_CDN}/s750x600/{_D}/ue-20251026074643-n2fso.jpg",
    "e5": f"{_CDN}/s750x550/{_D}/e5-20251025183559-tefsq.jpg",
    "z323": f"{_CDN}/s1800x1150/{_D}/323-20251025180245-hp9dc.jpg",
    "tienIch": f"{_CDN}/s1440x700/{_D}/78-20251022184429-lkrs1.jpg",
    "quangTruong": f"{_CDN}/s1440x901/{_D}/32-20251023124829-vq-ov.jpg",
    "aerial": f"{_CDN}/s1440x981/{_D}/66-20251025162125-jom7b.jpg",
    "cvAnhSang": f"{_CDN}/s550x550/{_D}/pc12_tien-ich-cv-anh-sang_edit_logo_resize-20251026163257-geeew.jpg",
    "e687": f"{_CDN}/s768x687/{_D}/e-20251025153816-jv4zb.jpg",
    "v4": f"{_CDN}/s750x550/{_D}/4-20251026131552-qld4z.jpg",
}

_NEWS_URL = "https://eurowindowlightcity.vn"


def _overview() -> OverviewSection:
    return OverviewSection(
        hero_images=[
            HeroImage(src=_IMG["tongThe"], caption="Phối cảnh tổng thể khu đô thị Eurowindow Light City"),
            HeroImage(src=_IMG["hoangHon"], caption="Trục cảnh quan trung tâm lúc hoàng hôn"),
            HeroImage(src=_IMG["daiLoAnhSang"], caption="Đại lộ Ánh Sáng"),
            HeroImage(src=_IMG["lkNhat"], caption="Phân khu liền kề phong cách Nhật Bản"),
            HeroImage(src=_IMG["venHo"], caption="Không gian sống xanh ven hồ"),
            HeroImage(src=_IMG["tienIch"], caption="Tiện ích nội khu đẳng cấp"),
            HeroImage(src=_IMG["quangTruong"], caption="Quảng trường trung tâm"),
            HeroImage(src=_IMG["aerial"], caption="Tổng quan dự án nhìn từ trên cao"),
        ],
        rows=[
            KeyValue(label="Chủ đầu tư", value="Công ty TNHH Đầu tư Bất động sản Eurowindow Light City"),
            KeyValue(label="Đơn vị phát triển", value="Eurowindow Holding"),
            KeyValue(label="Vị trí", value="Phường Nguyệt Viên, TP Thanh Hoá"),
            KeyValue(label="Quy mô", value="176 ha"),
            KeyValue(label="Tổng vốn đầu tư", value="Khoảng 12.000 tỷ đồng (BIDV và Techcombank cấp tín dụng)"),
            KeyValue(label="Khởi công", value="Quý 3/2025"),
            KeyValue(label="Bàn giao đợt 1", value="Quý 2/2026"),
            KeyValue(
                label="Loại hình sản phẩm",
                value=(
                    "Nhà liền kề 2.461 căn · Biệt thự 523 căn · Biệt thự đảo view hồ 78 căn · "
                    "Chung cư 1.662 căn · Shophouse khối đế 312 căn · Shophouse 2 mặt tiền 187 căn"
                ),
            ),
        ],
    )


def _location() -> LocationSection:
    return LocationSection(
        description=(
            "Eurowindow Light City toạ lạc tại phường Nguyệt Viên, TP Thanh Hoá — ngay cửa "
            "ngõ phía Bắc thành phố, liền kề Quốc lộ 1A và cầu Hoằng Long. Vị trí kết nối "
            "thuận tiện tới trung tâm hành chính, trường học, bệnh viện và hệ thống thương "
            "mại dịch vụ, mang đến giá trị an cư và đầu tư bền vững bên dòng sông Mã."
        ),
        connections=[
            Connection(place="Quốc lộ 1A", time="1 phút"),
            Connection(place="Cầu Hoằng Long", time="3 phút"),
            Connection(place="Trường TH & THCS Tào Xuyên", time="6 phút"),
            Connection(place="Siêu thị Go!", time="10 phút"),
            Connection(place="Bệnh viện đa khoa Hàm Rồng", time="10 phút"),
        ],
        map_lat=19.8847,
        map_lng=105.7894,
    )


def _training() -> TrainingSection:
    return TrainingSection(
        items=[
            TrainingItem(title="Slide kickoff dự án ELC", size="PDF", date="20/10/2025", href="#", ready=False),
            TrainingItem(title="Quy trình booking & lock căn", size="PDF", date="22/10/2025", href="#", ready=False),
            TrainingItem(title="Slide đào tạo đại lý F1", size="PDF", date="25/10/2025", href="#", ready=False),
        ]
    )


def _subzones() -> SubzonesSection:
    return SubzonesSection(
        items=[
            Subzone(
                name="Bình Minh", style="Phong cách Nhật Bản", units="≈ 420 căn liền kề",
                desc=(
                    "Phân khu mở bán đầu tiên, kiến trúc tối giản kiểu Nhật. Tiến độ hạ tầng "
                    "dẫn đầu toàn dự án, dự kiến bàn giao Quý 2/2026."
                ),
                img=_IMG["lkNhat"],
            ),
            Subzone(
                name="Mặt Trời", style="Phong cách Đông Dương", units="≈ 380 căn liền kề",
                desc=(
                    "Lấy cảm hứng kiến trúc Đông Dương sang trọng, đón trọn ánh nắng bình minh. "
                    "Vị trí gần trục cảnh quan trung tâm."
                ),
                img=_IMG["hoangHon2"],
            ),
            Subzone(
                name="Cầu Vồng", style="Pháp tân cổ điển", units="≈ 350 căn liền kề",
                desc=(
                    "Dải nhà phố sắc màu rực rỡ men theo Đại lộ Ánh Sáng, lý tưởng cho kinh "
                    "doanh và an cư kết hợp."
                ),
                img=_IMG["daiLo2"],
            ),
            Subzone(
                name="Ánh Sao", style="Phong cách Hy Lạp", units="≈ 310 căn liền kề",
                desc=(
                    "Kiến trúc Địa Trung Hải tinh khôi, không gian thoáng đãng. Liền kề công "
                    "viên và tiện ích nội khu."
                ),
                img=_IMG["m16b"],
            ),
            Subzone(
                name="Ánh Trăng", style="Phong cách Italia", units="≈ 290 biệt thự",
                desc=(
                    "Dòng biệt thự cao cấp phong cách Ý, nhiều căn view hồ và đảo trung tâm. "
                    "Mật độ xây dựng thấp, riêng tư."
                ),
                img=_IMG["ue"],
            ),
            Subzone(
                name="Ánh Sáng", style="Pháp cổ điển", units="≈ 260 căn shophouse",
                desc=(
                    "Tuyến shophouse thương mại sầm uất quanh công viên Ánh Sáng — biểu tượng "
                    "giải trí và mua sắm của khu đô thị."
                ),
                img=_IMG["cvAnhSang"],
            ),
            Subzone(
                name="Hừng Đông", style="Phong cách Art Deco", units="≈ 240 căn liền kề",
                desc=(
                    "Phong cách Art Deco hiện đại, đường nét mạnh mẽ. Cửa ngõ đón cư dân từ "
                    "phía Quốc lộ 1A."
                ),
                img=_IMG["z323"],
            ),
        ]
    )


def _gallery360() -> Gallery360Section:
    # TOURS_360 = SUBZONES.map(...) trong elc-data.ts.
    subs = _subzones().items
    return Gallery360Section(
        items=[Tour360(title=f"Trải nghiệm 360° phân khu {z.name}", img=z.img, ready=False) for z in subs]
    )


def _policy() -> PolicySection:
    return PolicySection(
        policies=[
            PolicyCard(
                title="Đợt 1 — Phân khu Bình Minh (đang mở bán)",
                date="Đang áp dụng",
                open=True,
                summary=(
                    "Ưu đãi mở bán giai đoạn đầu áp dụng cho khách hàng đặt cọc thiện chí và "
                    "đại lý F1, đồng tài trợ bởi BIDV và Techcombank."
                ),
                highlights=[
                    "Chiết khấu 5% giá trị căn",
                    "Hỗ trợ lãi suất 0% trong 42 tháng (BIDV + Techcombank)",
                    "Tặng gói nội thất trị giá 50 - 200 triệu đồng theo dòng sản phẩm",
                    "Ưu tiên chọn căn đẹp, vị trí trục cảnh quan",
                ],
            ),
            PolicyCard(
                title="Đợt 2 — Phân khu Mặt Trời & Cầu Vồng",
                date="Dự kiến Quý 3/2026",
                open=False,
                summary=(
                    "Mở rộng quỹ căn liền kề và shophouse. Bảng giá và điều kiện thanh toán "
                    "chi tiết chưa được công bố."
                ),
                highlights=[
                    "Thông tin chính sách chưa công bố",
                    "Dự kiến ưu tiên khách hàng thân thiết đợt 1",
                    "Liên hệ chuyên viên kinh doanh để được cập nhật sớm nhất",
                ],
            ),
        ],
        price_table=[
            PriceRow(product="Nhà liền kề", area="75 - 120 m²", price_from="Từ 1,9 tỷ"),
            PriceRow(product="Shophouse", area="90 - 150 m²", price_from="Từ 4,2 tỷ"),
            PriceRow(product="Biệt thự", area="180 - 300 m²", price_from="Từ 5,5 tỷ"),
        ],
        commission_note=(
            "Mức hoa hồng cạnh tranh kèm thưởng nóng theo căn cho đại lý F1. Chi tiết theo "
            "phụ lục hợp đồng phân phối từng đợt — đang cập nhật."
        ),
    )


def _timeline() -> TimelineSection:
    return TimelineSection(
        items=[
            TimelineItem(period="Quý 3/2025", title="Khởi công dự án",
                         desc="Khởi công xây dựng hạ tầng kỹ thuật khu đô thị 176 ha bên sông Mã.",
                         img=_IMG["tongThe"]),
            TimelineItem(period="Quý 4/2025", title="Hoàn thiện hạ tầng phân khu Bình Minh",
                         desc="San nền, hệ thống đường nội khu và cảnh quan phân khu Bình Minh.",
                         img=_IMG["lkNhat"]),
            TimelineItem(period="Quý 1/2026", title="Khởi công phân khu Mặt Trời & Cầu Vồng",
                         desc="Triển khai hai phân khu liền kề tiếp theo và các tiện ích trục trung tâm.",
                         img=_IMG["hoangHon2"]),
            TimelineItem(period="22/05/2026", title="Khai trương VPBH và sa bàn dự án",
                         desc="Khai trương văn phòng bán hàng và sa bàn, sẵn sàng đón khách tham quan trải nghiệm.",
                         img=_IMG["v4"]),
            TimelineItem(period="Quý 2/2026", title="Bàn giao đợt 1 — phân khu Bình Minh",
                         desc="Bàn giao những căn liền kề đầu tiên cho khách hàng phân khu Bình Minh.",
                         img=_IMG["venHo"]),
            TimelineItem(period="Quý 4/2026", title="Bàn giao đợt 2",
                         desc="Tiếp tục bàn giao quỹ căn đợt 2 và hoàn thiện tiện ích trung tâm.",
                         img=_IMG["quangTruong"]),
        ]
    )


def _news() -> NewsSection:
    return NewsSection(
        items=[
            NewsItem(
                title="BIDV và Techcombank cấp 12.000 tỷ tín dụng cho Eurowindow Light City",
                date="17/10/2025",
                excerpt=(
                    "Hai ngân hàng lớn đồng tài trợ nguồn vốn 12.000 tỷ đồng, khẳng định tiềm "
                    "lực và tính khả thi của dự án 176 ha."
                ),
                img=_IMG["e687"], url=_NEWS_URL,
            ),
            NewsItem(
                title="Eurowindow Holding lọt TOP 40 doanh nghiệp tư nhân lớn nhất Việt Nam",
                date="08/10/2025",
                excerpt=(
                    "Eurowindow Holding tiếp tục khẳng định vị thế trên bảng xếp hạng doanh "
                    "nghiệp tư nhân hàng đầu cả nước."
                ),
                img=_IMG["aerial"], url=_NEWS_URL,
            ),
            NewsItem(
                title="Đặc quyền sống của cư dân Eurowindow Light City",
                date="19/09/2025",
                excerpt=(
                    "Hệ sinh thái tiện ích all-in-one: công viên, quảng trường, trường học và "
                    "trung tâm thương mại nội khu."
                ),
                img=_IMG["tienIch"], url=_NEWS_URL,
            ),
            NewsItem(
                title="Đại lộ Ánh Sáng — biểu tượng mới của đô thị Thanh Hoá",
                date="28/08/2025",
                excerpt=(
                    "Trục đại lộ trung tâm với hệ thống chiếu sáng nghệ thuật hứa hẹn trở thành "
                    "điểm đến biểu tượng."
                ),
                img=_IMG["daiLo2"], url=_NEWS_URL,
            ),
            NewsItem(
                title="Điểm nhấn kiến trúc và ánh sáng trên khu đô thị 176 ha",
                date="13/11/2025",
                excerpt=(
                    "Quy hoạch ánh sáng đồng bộ cùng kiến trúc đa phong cách tạo nên bản sắc "
                    "riêng cho Eurowindow Light City."
                ),
                img=_IMG["cvAnhSang"], url=_NEWS_URL,
            ),
            NewsItem(
                title="Đại lộ ánh sáng độc bản tại Việt Nam",
                date="12/11/2025",
                excerpt=(
                    "Lần đầu tiên một đại lộ ánh sáng quy mô lớn được kiến tạo, mang trải "
                    "nghiệm sống khác biệt cho cư dân."
                ),
                img=_IMG["hoangHon"], url=_NEWS_URL,
            ),
        ]
    )


def default_elc_project() -> ProjectDoc:
    """ProjectDoc gốc của Eurowindow Light City (seed lần đầu cho project_store)."""
    return ProjectDoc(
        slug=DEFAULT_SLUG,
        name="EUROWINDOW LIGHT CITY",
        tagline=(
            "Theo dõi thông tin chi tiết và bảng giá, quỹ căn, mặt bằng, tiến độ và chính "
            "sách bán hàng dự án EUROWINDOW LIGHT CITY."
        ),
        status="Đang mở bán",
        developer="Eurowindow Holding",
        location="Phường Nguyệt Viên, TP Thanh Hoá",
        content=ProjectContent(
            overview=_overview(),
            location=_location(),
            training=_training(),
            subzones=_subzones(),
            gallery360=_gallery360(),
            policy=_policy(),
            timeline=_timeline(),
            news=_news(),
        ),
        version=1,
    )
