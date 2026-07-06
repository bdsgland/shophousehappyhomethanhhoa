"""Seed mặc định cho dự án Shophouse Happy Home Thanh Hóa (slug happy-home-thanh-hoa).

Chuyển y nguyên nội dung tĩnh từ apps/web/components/dashboard/project-data.ts sang
ProjectDoc để khi project_store khởi tạo lần đầu KHÔNG mất nội dung đang hiển thị.
Trang web vẫn giữ project-data.ts làm fallback offline; đây là "bản gốc" trong store
để admin chỉnh và đồng bộ ra sale/khách.

Nguồn số liệu: brochure + tờ gấp bán hàng chính thức của dự án (Google Drive
"TÀI LIỆU BÁN HÀNG"). Đại lý phát triển kinh doanh: BDSG LAND.

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

DEFAULT_SLUG = "happy-home-thanh-hoa"

# ----- Ảnh THẬT từ tờ gấp bán hàng (giống project-data.ts, public/hh-assets) -----
_IMG = {
    "toGap1": "/hh-assets/to-gap-01-web.jpg",
    "toGap2": "/hh-assets/to-gap-02-web.jpg",
}

_NEWS_URL = "https://happyhomethanhhoa.bdsg.land"


def _overview() -> OverviewSection:
    return OverviewSection(
        hero_images=[
            HeroImage(
                src=_IMG["toGap2"],
                caption="Shophouse Happy Home — giữa trung tâm hành chính mới Thanh Hóa",
            ),
            HeroImage(
                src=_IMG["toGap1"],
                caption="Vị trí đắc địa: Cận thị – Cận giang – Cận lộ, bên Đại lộ Nam Sông Mã",
            ),
        ],
        rows=[
            KeyValue(label="Tên dự án tổng thể", value="Dự án số 01 Khu đô thị trung tâm TP. Thanh Hóa"),
            KeyValue(label="Chủ đầu tư", value="Tập đoàn Vingroup — Công ty CP"),
            KeyValue(label="Đơn vị hợp tác đầu tư", value="Công ty Cổ phần Quản lý Đầu tư ACD"),
            KeyValue(label="Đại lý phát triển kinh doanh", value="BDSG LAND — Công ty Cổ phần Tập đoàn BDSG"),
            KeyValue(label="Vị trí", value="Phường Hạc Thành, tỉnh Thanh Hóa"),
            KeyValue(label="Diện tích đất", value="91.891,6 m²"),
            KeyValue(label="Mật độ xây dựng", value="27% – 36%"),
            KeyValue(label="Quy mô", value="Dự kiến 2.824 căn hộ · 18 tòa · xây dựng trên 06 lô đất"),
            KeyValue(
                label="Sản phẩm trọng tâm",
                value="Shophouse khối đế (SH01 – SH16) tại các Block 1 · 2 · 3",
            ),
            KeyValue(
                label="Pháp lý",
                value=(
                    "QĐ 3916/QĐ-UBND (16/10/2017) chấp thuận chủ trương; QĐ 2827/QĐ-UBND "
                    "(04/08/2017) & QĐ 1775/QĐ-UBND (25/05/2023) phê duyệt/điều chỉnh QH 1/500"
                ),
            ),
        ],
    )


def _location() -> LocationSection:
    return LocationSection(
        description=(
            "Shophouse Happy Home tọa lạc đắc địa tại trung tâm hành chính mới của "
            "TP. Thanh Hóa, phường Hạc Thành — ngay bên Đại lộ Nam Sông Mã, tạo thế "
            "phong thủy 'Cận thị – Cận giang – Cận lộ' độc đáo. Chưa tới 10 phút tiếp "
            "cận hạ tầng thiết yếu: BigC GO!, Vincom Plaza, trường liên cấp Newton, "
            "bệnh viện và các cơ quan hành chính tỉnh."
        ),
        connections=[
            Connection(place="Đại lộ Nam Sông Mã", time="1 phút"),
            Connection(place="Trung tâm hành chính mới TP. Thanh Hóa", time="5 phút"),
            Connection(place="BigC GO! Thanh Hóa", time="10 phút"),
            Connection(place="Vincom Plaza Thanh Hóa", time="10 phút"),
            Connection(place="Trường liên cấp Newton Thanh Hóa", time="10 phút"),
            Connection(place="UBND tỉnh & các cơ quan hành chính", time="15 phút"),
        ],
        # Toạ độ gần đúng khu trung tâm hành chính mới (cập nhật khi có toạ độ chuẩn).
        map_lat=19.8075,
        map_lng=105.8095,
    )


def _training() -> TrainingSection:
    return TrainingSection(
        items=[
            TrainingItem(title="Slide kickoff dự án Happy Home Thanh Hóa", size="PDF", date="Đang cập nhật", href="#", ready=False),
            TrainingItem(title="Quy trình booking & lock căn shophouse", size="PDF", date="Đang cập nhật", href="#", ready=False),
            TrainingItem(title="Slide đào tạo đại lý BDSG LAND", size="PDF", date="Đang cập nhật", href="#", ready=False),
        ]
    )


def _subzones() -> SubzonesSection:
    return SubzonesSection(
        items=[
            Subzone(
                name="Block 1", style="Shophouse khối đế — trục thương mại chính",
                units="Căn SH01 – SH16",
                desc=(
                    "Dãy shophouse khối đế mặt trục nội khu chính, lưu lượng cư dân qua lại "
                    "lớn nhất — vị trí kinh doanh đắt giá nhất dự án."
                ),
                img=_IMG["toGap2"],
            ),
            Subzone(
                name="Block 2", style="Shophouse khối đế — cạnh tiện ích trung tâm",
                units="Căn SH02 – SH13",
                desc=(
                    "Kề khu tiện ích và sân sinh hoạt cộng đồng, phù hợp mô hình F&B, "
                    "minimart, dịch vụ gia đình phục vụ ~2.800 căn hộ."
                ),
                img=_IMG["toGap1"],
            ),
            Subzone(
                name="Block 3", style="Shophouse khối đế — cửa ngõ đón khách",
                units="Căn SH01 – SH12",
                desc=(
                    "Vị trí cửa ngõ dự án hướng Đại lộ Nam Sông Mã, đón cả khách vãng lai "
                    "lẫn cư dân nội khu — lợi thế kép cho kinh doanh."
                ),
                img=_IMG["toGap2"],
            ),
        ]
    )


def _gallery360() -> Gallery360Section:
    # TOURS_360 = SUBZONES.map(...) trong project-data.ts.
    subs = _subzones().items
    return Gallery360Section(
        items=[Tour360(title=f"Trải nghiệm 360° shophouse {z.name}", img=z.img, ready=False) for z in subs]
    )


def _policy() -> PolicySection:
    return PolicySection(
        policies=[
            PolicyCard(
                title="Chính sách hiện hành — Shophouse Happy Home",
                date="Đang áp dụng",
                open=True,
                summary=(
                    "Ưu đãi theo tờ gấp bán hàng chính thức, áp dụng cho khách hàng giao "
                    "dịch qua đại lý phát triển kinh doanh BDSG LAND."
                ),
                highlights=[
                    "Chiết khấu 6% khi thanh toán sớm",
                    "Chiết khấu 2% khi thanh toán theo tiến độ",
                    "Hỗ trợ vay vốn ngân hàng",
                    "Ưu tiên chọn căn vị trí đẹp cho khách đặt sớm — liên hệ 0967 806 686",
                ],
            ),
            PolicyCard(
                title="Đợt tiếp theo",
                date="Sắp công bố",
                open=False,
                summary=(
                    "Bảng giá và điều kiện thanh toán đợt tiếp theo chưa được công bố "
                    "chính thức."
                ),
                highlights=[
                    "Thông tin chính sách chưa công bố",
                    "Dự kiến ưu tiên khách hàng đã quan tâm đợt hiện tại",
                    "Liên hệ chuyên viên BDSG LAND để được cập nhật sớm nhất",
                ],
            ),
        ],
        price_table=[
            PriceRow(product="Shophouse khối đế — Block 1", area="SH01 – SH16", price_from="Liên hệ 0967 806 686"),
            PriceRow(product="Shophouse khối đế — Block 2", area="SH02 – SH13", price_from="Liên hệ 0967 806 686"),
            PriceRow(product="Shophouse khối đế — Block 3", area="SH01 – SH12", price_from="Liên hệ 0967 806 686"),
        ],
        commission_note=(
            "Mức hoa hồng cạnh tranh kèm thưởng nóng theo căn cho đại lý. Chi tiết theo "
            "phụ lục hợp đồng phân phối từng đợt — liên hệ BDSG LAND."
        ),
    )


def _timeline() -> TimelineSection:
    return TimelineSection(
        items=[
            TimelineItem(period="16/10/2017", title="Chấp thuận chủ trương đầu tư",
                         desc="QĐ 3916/QĐ-UBND chấp thuận chủ trương đầu tư Dự án số 1 Khu đô thị trung tâm TP. Thanh Hóa.",
                         img=_IMG["toGap2"]),
            TimelineItem(period="25/05/2023", title="Điều chỉnh quy hoạch chi tiết 1/500",
                         desc="QĐ 1775/QĐ-UBND phê duyệt điều chỉnh Quy hoạch chi tiết 1/500 của dự án.",
                         img=_IMG["toGap1"]),
            TimelineItem(period="2025", title="Triển khai xây dựng các tòa Happy Home",
                         desc="Thi công các tòa căn hộ và khối đế shophouse trên 06 lô đất, tổng quy mô 18 tòa.",
                         img=_IMG["toGap2"]),
            TimelineItem(period="Hiện tại", title="Mở bán shophouse khối đế Block 1 · 2 · 3",
                         desc="BDSG LAND phân phối quỹ căn shophouse SH01 – SH16, chiết khấu tới 6% + hỗ trợ vay ngân hàng.",
                         img=_IMG["toGap1"]),
        ]
    )


def _news() -> NewsSection:
    return NewsSection(
        items=[
            NewsItem(
                title="Shophouse Happy Home — cơ hội kinh doanh giữa khu đô thị 2.824 căn hộ",
                date="2025",
                excerpt=(
                    "Khối đế thương mại phục vụ trực tiếp cộng đồng cư dân 18 tòa căn hộ, "
                    "vị trí trung tâm hành chính mới TP. Thanh Hóa."
                ),
                img=_IMG["toGap2"], url=_NEWS_URL,
            ),
            NewsItem(
                title="Vị thế 'Cận thị – Cận giang – Cận lộ' của Happy Home Thanh Hóa",
                date="2025",
                excerpt=(
                    "Bên Đại lộ Nam Sông Mã, chưa tới 10 phút tới BigC GO!, Vincom Plaza và "
                    "các tiện ích thiết yếu của thành phố."
                ),
                img=_IMG["toGap1"], url=_NEWS_URL,
            ),
            NewsItem(
                title="Chiết khấu tới 6% cho khách thanh toán sớm shophouse Happy Home",
                date="2025",
                excerpt=(
                    "Chính sách bán hàng hiện hành: CK 6% thanh toán sớm, CK 2% theo tiến độ, "
                    "hỗ trợ vay vốn ngân hàng — qua đại lý BDSG LAND."
                ),
                img=_IMG["toGap2"], url=_NEWS_URL,
            ),
        ]
    )


def default_elc_project() -> ProjectDoc:
    """ProjectDoc gốc của Shophouse Happy Home Thanh Hóa (seed lần đầu cho project_store).

    Tên hàm giữ nguyên (default_elc_project) vì project_store import theo tên này.
    """
    return ProjectDoc(
        slug=DEFAULT_SLUG,
        name="SHOPHOUSE HAPPY HOME THANH HÓA",
        tagline=(
            "Theo dõi thông tin chi tiết và bảng giá, quỹ căn, mặt bằng, tiến độ và chính "
            "sách bán hàng dự án SHOPHOUSE HAPPY HOME THANH HÓA — đại lý phát triển kinh "
            "doanh BDSG LAND."
        ),
        status="Đang mở bán",
        developer="Tập đoàn Vingroup — Công ty CP",
        location="Phường Hạc Thành, tỉnh Thanh Hóa",
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
