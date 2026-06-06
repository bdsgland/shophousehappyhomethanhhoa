"use client";

// Mặt bằng quỹ căn interactive bằng Leaflet (CRS.Simple — dùng ảnh thay toạ độ thật).
// Mỗi căn là 1 marker tô màu theo trạng thái; click marker → popup thông tin.
// Edit mode (admin): kéo marker để gắn lại vị trí (state local, chưa lưu backend).

import "leaflet/dist/leaflet.css";

import L from "leaflet";
import { useEffect, useMemo, useState } from "react";
import { ImageOverlay, MapContainer, Marker, Popup } from "react-leaflet";

import {
  MASTERPLAN_H,
  MASTERPLAN_IMG,
  MASTERPLAN_W,
} from "@/components/dashboard/elc-data";

export type MapUnit = {
  code: string;
  zone: string;
  type?: string;
  area: number;
  facade: number;
  status: string;
  price: string;
  position?: { x: number; y: number };
};

const STATUS_COLOR: Record<string, string> = {
  "Còn hàng": "#10b981", // xanh lá
  "Đã bán": "#ef4444", // đỏ
  "Đặt cọc": "#f59e0b", // vàng
};

function colorFor(status: string): string {
  return STATUS_COLOR[status] ?? "#6b7280";
}

function dotIcon(color: string, active: boolean): L.DivIcon {
  const size = active ? 20 : 16;
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);background:${color};cursor:${
      active ? "grab" : "pointer"
    }"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function MasterPlanMap({
  units,
  editable = false,
}: {
  units: MapUnit[];
  editable?: boolean;
}) {
  // Vị trí ghi đè khi kéo marker trong edit mode (key = mã căn).
  const [overrides, setOverrides] = useState<
    Record<string, { x: number; y: number }>
  >({});

  // Đổi bộ lọc → reset override để tránh lệch dữ liệu.
  useEffect(() => {
    setOverrides({});
  }, [editable]);

  // Bounds CRS.Simple: [[y0,x0],[y1,x1]].
  const bounds = useMemo<L.LatLngBoundsLiteral>(
    () => [
      [0, 0],
      [MASTERPLAN_H, MASTERPLAN_W],
    ],
    [],
  );

  return (
    <MapContainer
      crs={L.CRS.Simple}
      bounds={bounds}
      maxBounds={bounds}
      maxBoundsViscosity={0.8}
      minZoom={-2}
      maxZoom={2}
      scrollWheelZoom
      attributionControl={false}
      className="h-[420px] w-full rounded-xl lg:h-[560px]"
      style={{ background: "#eef2f5" }}
    >
      <ImageOverlay url={MASTERPLAN_IMG} bounds={bounds} />
      {units.map((u) => {
        const base = overrides[u.code] ?? u.position;
        if (!base) return null;
        return (
          <Marker
            key={u.code}
            position={[base.y, base.x]}
            draggable={editable}
            icon={dotIcon(colorFor(u.status), editable)}
            eventHandlers={
              editable
                ? {
                    dragend: (e) => {
                      const ll = (e.target as L.Marker).getLatLng();
                      setOverrides((prev) => ({
                        ...prev,
                        [u.code]: { x: ll.lng, y: ll.lat },
                      }));
                    },
                  }
                : undefined
            }
          >
            <Popup>
              <div className="min-w-[180px] text-[13px] leading-relaxed">
                <div className="mb-1 text-sm font-bold text-slate-900">
                  Lô {u.code}
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Phân khu</span>
                  <span className="font-medium text-slate-900">{u.zone}</span>
                </div>
                {u.type && (
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Loại</span>
                    <span className="font-medium text-slate-900">{u.type}</span>
                  </div>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Diện tích</span>
                  <span className="font-medium text-slate-900">
                    {u.area} m²
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Mặt tiền</span>
                  <span className="font-medium text-slate-900">
                    {u.facade} m
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-slate-500">Giá</span>
                  <span className="font-semibold text-amber-600">{u.price}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: colorFor(u.status) }}
                  />
                  <span className="font-medium text-slate-900">{u.status}</span>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
