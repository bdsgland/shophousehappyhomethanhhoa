"""Sinh phiếu báo giá PDF cho sale — thương hiệu Eurowindow Light City.

Dùng reportlab (thuần Python, chạy được trên Railway, không cần lib hệ thống như
weasyprint). Font DejaVu Sans bundle trong app/assets/fonts để render tiếng Việt
có dấu chuẩn trên mọi môi trường (Helvetica mặc định của reportlab không có
glyph tiếng Việt).
"""

from __future__ import annotations

import io
import logging
from datetime import datetime
from pathlib import Path
from typing import List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

log = logging.getLogger(__name__)

_FONT_DIR = Path(__file__).resolve().parent.parent / "assets" / "fonts"
_FONT = "DejaVuSans"
_FONT_BOLD = "DejaVuSans-Bold"
_fonts_ready = False

# Bảng màu thương hiệu ELC (cam/vàng đồng).
_BRAND = colors.HexColor("#C8821E")
_BRAND_DARK = colors.HexColor("#7A4E12")
_BG_SOFT = colors.HexColor("#FBF3E6")
_INK = colors.HexColor("#2A2118")

# Tiến độ thanh toán theo từng phương án (label, % giá trị căn).
PAYMENT_PLANS: dict[str, list[tuple[str, float]]] = {
    "standard": [
        ("Đặt cọc thiện chí", 10),
        ("Ký Hợp đồng mua bán (HĐMB)", 20),
        ("Đợt 2 — thi công móng", 20),
        ("Đợt 3 — xây thô", 20),
        ("Đợt 4 — hoàn thiện", 20),
        ("Bàn giao + ra sổ", 10),
    ],
    "fast": [
        ("Đặt cọc thiện chí", 10),
        ("Thanh toán sớm 95% (trong 30 ngày) — hưởng chiết khấu", 90),
    ],
    "loan": [
        ("Đặt cọc thiện chí", 10),
        ("Vốn tự có khi ký HĐMB", 20),
        ("Ngân hàng giải ngân (vay)", 70),
    ],
}

PAYMENT_PLAN_LABELS = {
    "standard": "Tiến độ chuẩn",
    "fast": "Thanh toán nhanh",
    "loan": "Vay ngân hàng",
}


def _ensure_fonts() -> None:
    global _fonts_ready
    if _fonts_ready:
        return
    try:
        pdfmetrics.registerFont(TTFont(_FONT, str(_FONT_DIR / "DejaVuSans.ttf")))
        pdfmetrics.registerFont(
            TTFont(_FONT_BOLD, str(_FONT_DIR / "DejaVuSans-Bold.ttf"))
        )
        pdfmetrics.registerFontFamily(
            _FONT, normal=_FONT, bold=_FONT_BOLD, italic=_FONT, boldItalic=_FONT_BOLD
        )
        _fonts_ready = True
    except Exception as e:  # noqa: BLE001
        log.error("Không nạp được font DejaVu (%s) — fallback Helvetica", e)


def fmt_vnd(amount: float) -> str:
    """Định dạng số tiền VND có dấu chấm ngăn cách nghìn."""
    return f"{int(round(amount)):,}".replace(",", ".") + " ₫"


def compute_quote(list_price: float, discount_pct: float, payment_plan: str):
    """Tính giá sau chiết khấu + bảng tiến độ thanh toán.

    Trả về (discount_amount, total_price, milestones) với milestones là list
    dict {label, pct, amount} tính trên giá SAU chiết khấu.
    """
    discount_amount = list_price * (discount_pct / 100.0)
    total_price = list_price - discount_amount
    plan = PAYMENT_PLANS.get(payment_plan, PAYMENT_PLANS["standard"])
    milestones = [
        {"label": label, "pct": pct, "amount": total_price * (pct / 100.0)}
        for label, pct in plan
    ]
    return discount_amount, total_price, milestones


def _styles():
    base = getSampleStyleSheet()
    font = _FONT if _fonts_ready else "Helvetica"
    font_bold = _FONT_BOLD if _fonts_ready else "Helvetica-Bold"
    styles = {
        "title": ParagraphStyle(
            "title", parent=base["Title"], fontName=font_bold,
            fontSize=18, textColor=_BRAND_DARK, spaceAfter=2,
        ),
        "brand": ParagraphStyle(
            "brand", fontName=font_bold, fontSize=13, textColor=_BRAND,
        ),
        "sub": ParagraphStyle(
            "sub", fontName=font, fontSize=8.5, textColor=colors.HexColor("#8A7B66"),
        ),
        "h2": ParagraphStyle(
            "h2", fontName=font_bold, fontSize=11, textColor=_BRAND_DARK,
            spaceBefore=10, spaceAfter=4,
        ),
        "body": ParagraphStyle(
            "body", fontName=font, fontSize=9.5, textColor=_INK, leading=14,
        ),
        "cell": ParagraphStyle("cell", fontName=font, fontSize=9, textColor=_INK, leading=12),
        "cellb": ParagraphStyle("cellb", fontName=font_bold, fontSize=9, textColor=_INK, leading=12),
        "right": ParagraphStyle("right", fontName=font, fontSize=9, textColor=_INK, alignment=2),
        "foot": ParagraphStyle("foot", fontName=font, fontSize=8, textColor=colors.HexColor("#8A7B66")),
    }
    return styles, font, font_bold


def build_quote_pdf(*, quote_id: str, unit: dict, req, computed: dict) -> bytes:
    """Render PDF, trả về bytes.

    `unit` = dict căn từ inventory; `req` = QuoteRequest; `computed` chứa
    list_price/discount_amount/total_price/milestones.
    """
    _ensure_fonts()
    styles, font, font_bold = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Phiếu báo giá {unit.get('id', '')}",
    )
    story: list = []

    # ----- Header thương hiệu -----
    header = Table(
        [[
            Paragraph("EUROWINDOW<br/>LIGHT CITY", styles["brand"]),
            Paragraph(
                "PHIẾU BÁO GIÁ CĂN HỘ<br/>"
                f"<font size=8 color='#8A7B66'>Mã phiếu: {quote_id[:8].upper()} · "
                f"Ngày lập: {datetime.now().strftime('%d/%m/%Y')}</font>",
                ParagraphStyle("hr", parent=styles["title"], alignment=2, fontSize=15),
            ),
        ]],
        colWidths=[70 * mm, 104 * mm],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 2, _BRAND),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(header)
    story.append(Spacer(1, 10))

    # ----- Thông tin khách hàng & sale -----
    info = Table(
        [
            [Paragraph("KHÁCH HÀNG", styles["h2"]), Paragraph("CHUYÊN VIÊN TƯ VẤN", styles["h2"])],
            [
                Paragraph(
                    f"<b>Họ tên:</b> {req.customer_name or '—'}<br/>"
                    f"<b>Điện thoại:</b> {req.customer_phone or '—'}",
                    styles["body"],
                ),
                Paragraph(
                    f"<b>Họ tên:</b> {req.sale_name or '—'}<br/>"
                    f"<b>Điện thoại:</b> {req.sale_phone or '—'}",
                    styles["body"],
                ),
            ],
        ],
        colWidths=[87 * mm, 87 * mm],
    )
    info.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _BG_SOFT),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BOX", (0, 0), (-1, -1), 0.5, _BRAND),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8D9BF")),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(info)

    # ----- Thông tin căn -----
    story.append(Paragraph("THÔNG TIN CĂN", styles["h2"]))
    unit_rows = [
        ["Mã căn", str(unit.get("id", "—")), "Phân khu", str(unit.get("phan_khu", "—"))],
        ["Loại sản phẩm", str(unit.get("loai", "—")), "Trạng thái", str(unit.get("trang_thai", "—"))],
        ["Diện tích", f"{unit.get('dien_tich', '—')} m²", "Mặt tiền", f"{unit.get('mat_tien', '—')} m"],
    ]
    unit_tbl = Table(
        [[Paragraph(c, styles["cellb"] if i % 2 == 0 else styles["cell"]) for i, c in enumerate(r)]
         for r in unit_rows],
        colWidths=[30 * mm, 57 * mm, 30 * mm, 57 * mm],
    )
    unit_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), _BG_SOFT),
        ("BACKGROUND", (2, 0), (2, -1), _BG_SOFT),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8D9BF")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(unit_tbl)

    # ----- Bảng giá -----
    story.append(Paragraph("GIÁ BÁN", styles["h2"]))
    price_rows = [
        ["Giá niêm yết", Paragraph(fmt_vnd(computed["list_price"]), styles["right"])],
        [f"Chiết khấu ({req.discount_pct:g}%)",
         Paragraph("− " + fmt_vnd(computed["discount_amount"]), styles["right"])],
        ["TỔNG GIÁ TRỊ SAU CHIẾT KHẤU",
         Paragraph(f"<b>{fmt_vnd(computed['total_price'])}</b>", styles["right"])],
    ]
    price_tbl = Table(
        [[Paragraph(r[0], styles["cellb"] if i == 2 else styles["cell"]), r[1]]
         for i, r in enumerate(price_rows)],
        colWidths=[120 * mm, 54 * mm],
    )
    price_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8D9BF")),
        ("BACKGROUND", (0, 2), (-1, 2), _BRAND),
        ("TEXTCOLOR", (0, 2), (-1, 2), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    # Ô tổng (hàng 2) cho chữ trắng — set lại style cho Paragraph trong cell.
    story.append(price_tbl)

    # ----- Tiến độ thanh toán -----
    plan_label = PAYMENT_PLAN_LABELS.get(req.payment_plan, req.payment_plan)
    story.append(Paragraph(f"TIẾN ĐỘ THANH TOÁN — {plan_label}", styles["h2"]))
    head = [Paragraph("Đợt", styles["cellb"]), Paragraph("Nội dung", styles["cellb"]),
            Paragraph("Tỷ lệ", styles["cellb"]), Paragraph("Số tiền", styles["cellb"])]
    rows = [head]
    for i, m in enumerate(computed["milestones"], 1):
        rows.append([
            Paragraph(str(i), styles["cell"]),
            Paragraph(m["label"], styles["cell"]),
            Paragraph(f"{m['pct']:g}%", styles["cell"]),
            Paragraph(fmt_vnd(m["amount"]), styles["right"]),
        ])
    rows.append([
        Paragraph("", styles["cell"]), Paragraph("TỔNG CỘNG", styles["cellb"]),
        Paragraph("100%", styles["cellb"]),
        Paragraph(f"<b>{fmt_vnd(computed['total_price'])}</b>", styles["right"]),
    ])
    pay_tbl = Table(rows, colWidths=[14 * mm, 110 * mm, 18 * mm, 32 * mm])
    pay_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), _BRAND_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, -1), (-1, -1), _BG_SOFT),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8D9BF")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(pay_tbl)

    if getattr(req, "note", None):
        story.append(Paragraph("GHI CHÚ", styles["h2"]))
        story.append(Paragraph(req.note, styles["body"]))

    # ----- Chân trang -----
    story.append(Spacer(1, 14))
    sign = Table(
        [[
            Paragraph("<b>KHÁCH HÀNG</b><br/><font size=7>(Ký, ghi rõ họ tên)</font>", styles["body"]),
            Paragraph(
                f"<b>CHUYÊN VIÊN TƯ VẤN</b><br/><font size=7>(Ký, ghi rõ họ tên)</font>"
                f"<br/><br/><br/><b>{req.sale_name or ''}</b>",
                ParagraphStyle("sg", parent=styles["body"], alignment=1),
            ),
        ]],
        colWidths=[87 * mm, 87 * mm],
    )
    sign.setStyle(TableStyle([
        ("ALIGN", (0, 0), (0, 0), "CENTER"),
        ("ALIGN", (1, 0), (1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(sign)
    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "Báo giá có giá trị tham khảo trong 07 ngày kể từ ngày lập và có thể thay đổi "
        "theo chính sách bán hàng từng thời điểm của Chủ đầu tư. Vui lòng liên hệ chuyên "
        "viên tư vấn để được xác nhận suất căn và ký quỹ giữ chỗ.",
        styles["foot"],
    ))

    doc.build(story)
    return buf.getvalue()


def list_price_vnd(unit: dict) -> float:
    """Suy ra giá niêm yết (VND) từ căn inventory.

    Inventory lưu `gia_tri` theo tỷ đồng (vd 1.9). Quy đổi sang VND.
    """
    gia_tri = unit.get("gia_tri")
    if gia_tri is None:
        return 0.0
    return float(gia_tri) * 1_000_000_000


def _fmt_day(days):
    if days is None:
        return "—"
    if days == 0:
        return "Khi ký HĐMB"
    return f"+{days} ngày"


def build_policy_quote_pdf(*, quote_id: str, unit: dict, req, computed: dict) -> bytes:
    """PDF "PHIẾU TÍNH GIÁ" khớp mẫu Excel CĐT (CK chồng tuần tự + 3 tiến độ).

    `computed` = kết quả services.pricing_policy.compute_policy_quote.
    """
    _ensure_fonts()
    styles, font, font_bold = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=14 * mm, bottomMargin=14 * mm,
        title=f"Phiếu tính giá {unit.get('id', '')}",
    )
    story: list = []

    def kv_table(rows, highlight_last=False, soft_rows=()):
        tbl = Table(
            [[Paragraph(r[0], styles["cellb"] if (i == len(rows) - 1 and highlight_last) else styles["cell"]),
              r[1]] for i, r in enumerate(rows)],
            colWidths=[118 * mm, 60 * mm],
        )
        st = [
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8D9BF")),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]
        for r in soft_rows:
            st.append(("BACKGROUND", (0, r), (-1, r), _BG_SOFT))
        if highlight_last:
            st += [("BACKGROUND", (0, len(rows) - 1), (-1, len(rows) - 1), _BRAND),
                   ("TEXTCOLOR", (0, len(rows) - 1), (-1, len(rows) - 1), colors.white)]
        tbl.setStyle(TableStyle(st))
        return tbl

    # Header
    header = Table(
        [[Paragraph("EUROWINDOW<br/>LIGHT CITY", styles["brand"]),
          Paragraph("PHIẾU TÍNH GIÁ CĂN HỘ<br/>"
                    f"<font size=8 color='#8A7B66'>Mã phiếu: {quote_id[:8].upper()} · "
                    f"Ngày lập: {datetime.now().strftime('%d/%m/%Y')}</font>",
                    ParagraphStyle("hr", parent=styles["title"], alignment=2, fontSize=15))]],
        colWidths=[70 * mm, 108 * mm],
    )
    header.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                ("LINEBELOW", (0, 0), (-1, -1), 2, _BRAND),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 8)]))
    story.append(header)
    story.append(Spacer(1, 8))

    # Khách & sale
    info = Table(
        [[Paragraph("KHÁCH HÀNG", styles["h2"]), Paragraph("CHUYÊN VIÊN TƯ VẤN", styles["h2"])],
         [Paragraph(f"<b>Họ tên:</b> {req.customer_name or '—'}<br/><b>Điện thoại:</b> {req.customer_phone or '—'}", styles["body"]),
          Paragraph(f"<b>Họ tên:</b> {req.sale_name or '—'}<br/><b>Điện thoại:</b> {req.sale_phone or '—'}", styles["body"])]],
        colWidths=[89 * mm, 89 * mm],
    )
    info.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), _BG_SOFT),
                              ("VALIGN", (0, 0), (-1, -1), "TOP"),
                              ("BOX", (0, 0), (-1, -1), 0.5, _BRAND),
                              ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8D9BF")),
                              ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                              ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    story.append(info)

    # Thông số sản phẩm
    story.append(Paragraph("THÔNG SỐ SẢN PHẨM", styles["h2"]))
    story.append(kv_table([
        ["Mã căn", Paragraph(str(unit.get("id", "—")), styles["right"])],
        ["Phân khu / Loại", Paragraph(f"{unit.get('phan_khu', '—')} · {unit.get('loai', '—')}", styles["right"])],
        ["Diện tích", Paragraph(f"{computed['dien_tich']:g} m²", styles["right"])],
        ["Đơn giá (gồm VAT, KPBT)", Paragraph(fmt_vnd(computed["don_gia"]) + " /m²", styles["right"])],
    ]))

    # Giá niêm yết
    story.append(Paragraph("GIÁ NIÊM YẾT", styles["h2"]))
    story.append(kv_table([
        ["Tổng giá trị niêm yết (gồm VAT, KPBT)", Paragraph(f"<b>{fmt_vnd(computed['gia_ny_gom_vat_kpbt'])}</b>", styles["right"])],
        ["— Trong đó VAT", Paragraph(fmt_vnd(computed["vat"]), styles["right"])],
        ["— Trong đó phí bảo trì (KPBT)", Paragraph(fmt_vnd(computed["kpbt"]), styles["right"])],
        ["— Giá trị xây dựng (NY)", Paragraph(fmt_vnd(computed["gt_xay"]), styles["right"])],
        ["Niêm yết chưa VAT, chưa KPBT", Paragraph(fmt_vnd(computed["niem_yet_chua_vat_kpbt"]), styles["right"])],
    ], soft_rows=(0,)))

    # Chiết khấu tuần tự
    story.append(Paragraph("CHIẾT KHẤU (chồng tuần tự)", styles["h2"]))
    drows = []
    if computed["gift_cash"]:
        drows.append(["Quà tặng tiền mặt", Paragraph("− " + fmt_vnd(computed["gift_cash"]), styles["right"])])
    for d in computed["discount_lines"]:
        drows.append([f"{d['label']} ({d['pct']:g}%)", Paragraph("− " + fmt_vnd(d["amount"]), styles["right"])])
    drows.append(["TỔNG GIẢM GIÁ", Paragraph(f"<b>− {fmt_vnd(computed['total_discount'])}</b>", styles["right"])])
    story.append(kv_table(drows, highlight_last=False, soft_rows=(len(drows) - 1,)))

    # Giá sản phẩm
    story.append(Paragraph("GIÁ SẢN PHẨM", styles["h2"]))
    story.append(kv_table([
        ["GT sản phẩm (gồm VAT, chưa KPBT)", Paragraph(fmt_vnd(computed["gtsp_gom_vat_chua_kpbt"]), styles["right"])],
        ["Cộng phí bảo trì (KPBT)", Paragraph("+ " + fmt_vnd(computed["kpbt"]), styles["right"])],
        ["GT đất (tham khảo)", Paragraph(fmt_vnd(computed["gt_dat"]), styles["right"])],
        ["GIÁ BÁN (gồm VAT, KPBT)", Paragraph(f"<b>{fmt_vnd(computed['gtsp_final'])}</b>", styles["right"])],
    ], highlight_last=True))

    # Tiến độ
    has_bank = any(m["bank_amount"] for m in computed["milestones"])
    story.append(Paragraph(f"TIẾN ĐỘ THANH TOÁN — {computed['base_plan_label']}", styles["h2"]))
    head = [Paragraph("Đợt", styles["cellb"]), Paragraph("Nội dung", styles["cellb"]),
            Paragraph("Mốc", styles["cellb"]), Paragraph("KH thanh toán", styles["cellb"])]
    if has_bank:
        head.append(Paragraph("NH giải ngân", styles["cellb"]))
    rows = [head]
    cust_total = 0.0
    bank_total = 0.0
    for i, m in enumerate(computed["milestones"], 1):
        cust_total += m["customer_amount"]
        bank_total += m["bank_amount"]
        row = [Paragraph(str(i), styles["cell"]), Paragraph(m["label"], styles["cell"]),
               Paragraph(_fmt_day(m.get("days_offset")), styles["cell"]),
               Paragraph(fmt_vnd(m["customer_amount"]) if m["customer_amount"] else "—", styles["right"])]
        if has_bank:
            row.append(Paragraph(fmt_vnd(m["bank_amount"]) if m["bank_amount"] else "—", styles["right"]))
        rows.append(row)
    total_row = [Paragraph("", styles["cell"]), Paragraph("TỔNG CỘNG", styles["cellb"]),
                 Paragraph("", styles["cellb"]), Paragraph(f"<b>{fmt_vnd(cust_total)}</b>", styles["right"])]
    if has_bank:
        total_row.append(Paragraph(f"<b>{fmt_vnd(bank_total)}</b>", styles["right"]))
    rows.append(total_row)
    widths = [12 * mm, 86 * mm, 24 * mm, 30 * mm] if not has_bank else [10 * mm, 64 * mm, 22 * mm, 30 * mm, 30 * mm]
    pay = Table(rows, colWidths=widths)
    pay.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), _BRAND_DARK),
                             ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                             ("BACKGROUND", (0, -1), (-1, -1), _BG_SOFT),
                             ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8D9BF")),
                             ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                             ("LEFTPADDING", (0, 0), (-1, -1), 5), ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                             ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    story.append(pay)

    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "Khoản đặt cọc thiện chí được khấu trừ vào đợt thanh toán đầu tiên. Giá và "
        "tiến độ theo chính sách bán hàng từng thời điểm của Chủ đầu tư; phiếu có giá "
        "trị tham khảo trong 07 ngày.", styles["foot"]))

    if getattr(req, "note", None):
        story.append(Paragraph("GHI CHÚ", styles["h2"]))
        story.append(Paragraph(req.note, styles["body"]))

    doc.build(story)
    return buf.getvalue()
