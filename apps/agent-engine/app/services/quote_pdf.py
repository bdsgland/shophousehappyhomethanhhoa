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


def build_policy_quote_pdf(
    *, quote_id: str, unit: dict, req, computed: dict
) -> bytes:
    """PDF "PHIẾU TÍNH GIÁ" theo chính sách bán hàng — tái dùng style/branding/font.

    `computed` = kết quả services.pricing_policy.compute_policy_quote (kèm
    discount_lines, vat/maintenance, total_payment, milestones) + base_plan_label.
    """
    _ensure_fonts()
    styles, font, font_bold = _styles()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=18 * mm, rightMargin=18 * mm,
        topMargin=16 * mm, bottomMargin=16 * mm,
        title=f"Phiếu tính giá {unit.get('id', '')}",
    )
    story: list = []

    # ----- Header -----
    header = Table(
        [[
            Paragraph("EUROWINDOW<br/>LIGHT CITY", styles["brand"]),
            Paragraph(
                "PHIẾU TÍNH GIÁ CĂN HỘ<br/>"
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

    # ----- Khách hàng & sale -----
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

    # ----- Chi tiết chính sách chiết khấu -----
    story.append(Paragraph(
        f"CHI TIẾT CHÍNH SÁCH CHIẾT KHẤU — {computed.get('base_plan_label', '')}",
        styles["h2"],
    ))
    rows = [[
        Paragraph("Khoản mục", styles["cellb"]),
        Paragraph("Tỷ lệ", styles["cellb"]),
        Paragraph("Số tiền", styles["cellb"]),
    ]]
    rows.append([
        Paragraph("Giá trị sản phẩm (chưa VAT)", styles["cell"]),
        Paragraph("", styles["cell"]),
        Paragraph(fmt_vnd(computed["list_price_ex_vat"]), styles["right"]),
    ])
    for d in computed["discount_lines"]:
        rows.append([
            Paragraph(d["label"], styles["cell"]),
            Paragraph(f"−{d['pct']:g}%", styles["cell"]),
            Paragraph("− " + fmt_vnd(d["amount"]), styles["right"]),
        ])
    rows.append([
        Paragraph("Giá sau chiết khấu", styles["cellb"]),
        Paragraph(f"−{computed['total_discount_pct']:g}%", styles["cellb"]),
        Paragraph(f"<b>{fmt_vnd(computed['price_after_discount'])}</b>", styles["right"]),
    ])
    rows.append([
        Paragraph(f"VAT ({computed['vat_pct']:g}%)", styles["cell"]),
        Paragraph("", styles["cell"]),
        Paragraph("+ " + fmt_vnd(computed["vat_amount"]), styles["right"]),
    ])
    rows.append([
        Paragraph(f"Phí bảo trì ({computed['maintenance_pct']:g}%)", styles["cell"]),
        Paragraph("", styles["cell"]),
        Paragraph("+ " + fmt_vnd(computed["maintenance_amount"]), styles["right"]),
    ])
    rows.append([
        Paragraph("TỔNG THANH TOÁN", styles["cellb"]),
        Paragraph("", styles["cellb"]),
        Paragraph(f"<b>{fmt_vnd(computed['total_payment'])}</b>", styles["right"]),
    ])
    n = len(rows)
    after_discount_row = 2 + len(computed["discount_lines"])
    price_tbl = Table(rows, colWidths=[112 * mm, 22 * mm, 40 * mm])
    price_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E8D9BF")),
        ("BACKGROUND", (0, 0), (-1, 0), _BRAND_DARK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, after_discount_row), (-1, after_discount_row), _BG_SOFT),
        ("BACKGROUND", (0, n - 1), (-1, n - 1), _BRAND),
        ("TEXTCOLOR", (0, n - 1), (-1, n - 1), colors.white),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(price_tbl)

    # ----- Tiến độ thanh toán -----
    story.append(Paragraph("TIẾN ĐỘ THANH TOÁN", styles["h2"]))
    head = [Paragraph("Đợt", styles["cellb"]), Paragraph("Nội dung", styles["cellb"]),
            Paragraph("Tỷ lệ", styles["cellb"]), Paragraph("Số tiền", styles["cellb"])]
    prows = [head]
    ms_total = 0.0
    for i, m in enumerate(computed["milestones"], 1):
        ms_total += m["amount"]
        label = m["label"]
        if m.get("deposit_deducted"):
            label += " (đã trừ cọc)"
        if m.get("needs_confirm"):
            label += " *"
        pct_txt = "—" if m.get("kind") == "amount_fixed" else f"{m['pct']:g}%"
        prows.append([
            Paragraph(str(i), styles["cell"]),
            Paragraph(label, styles["cell"]),
            Paragraph(pct_txt, styles["cell"]),
            Paragraph(fmt_vnd(m["amount"]), styles["right"]),
        ])
    prows.append([
        Paragraph("", styles["cell"]),
        Paragraph("CỘNG TIẾN ĐỘ (GTSP sau CK)", styles["cellb"]),
        Paragraph("", styles["cellb"]),
        Paragraph(f"<b>{fmt_vnd(ms_total)}</b>", styles["right"]),
    ])
    pay_tbl = Table(prows, colWidths=[14 * mm, 110 * mm, 18 * mm, 32 * mm])
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

    story.append(Spacer(1, 4))
    story.append(Paragraph(
        "Tiến độ tính trên Giá trị sản phẩm SAU chiết khấu; VAT và phí bảo trì "
        "thanh toán riêng theo thông báo của Chủ đầu tư. Khoản đặt cọc thiện chí "
        "được khấu trừ vào đợt thanh toán đầu tiên.",
        styles["foot"],
    ))
    if any(m.get("needs_confirm") for m in computed["milestones"]):
        story.append(Paragraph(
            "* Tỷ lệ đợt thanh toán là tạm tính theo chính sách, sẽ được Chủ đầu tư "
            "xác nhận chính thức.",
            styles["foot"],
        ))

    if getattr(req, "note", None):
        story.append(Paragraph("GHI CHÚ", styles["h2"]))
        story.append(Paragraph(req.note, styles["body"]))

    # ----- Chân trang + ký -----
    story.append(Spacer(1, 14))
    sign = Table(
        [[
            Paragraph("<b>KHÁCH HÀNG</b><br/><font size=7>(Ký, ghi rõ họ tên)</font>", styles["body"]),
            Paragraph(
                "<b>CHUYÊN VIÊN TƯ VẤN</b><br/><font size=7>(Ký, ghi rõ họ tên)</font>"
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
        "Phiếu tính giá có giá trị tham khảo trong 07 ngày kể từ ngày lập và có thể "
        "thay đổi theo chính sách bán hàng từng thời điểm của Chủ đầu tư.",
        styles["foot"],
    ))

    doc.build(story)
    return buf.getvalue()
