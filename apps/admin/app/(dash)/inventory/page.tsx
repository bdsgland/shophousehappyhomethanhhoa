"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutGrid, Map, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { deleteUnit, listInventory } from "@/lib/api";
import type { InventoryUnit } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { InventoryMap } from "@/components/inventory/InventoryMap";
import { InventorySyncCard } from "@/components/inventory/InventorySyncCard";
import { InventoryTable } from "@/components/inventory/InventoryTable";
import {
  LOAI_OPTIONS,
  PHAN_KHU_OPTIONS,
  TRANG_THAI_OPTIONS,
  UnitEditModal,
} from "@/components/inventory/UnitEditModal";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";

type View = "table" | "map";

interface Filters {
  phan_khu: string;
  loai: string;
  trang_thai: string;
}

const EMPTY_FILTERS: Filters = { phan_khu: "", loai: "", trang_thai: "" };

export default function InventoryPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("table");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUnit, setEditingUnit] = useState<InventoryUnit | null>(null);
  const [confirmDeleteUnit, setConfirmDeleteUnit] =
    useState<InventoryUnit | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-inventory", filters],
    queryFn: () => listInventory(filters),
  });

  // Danh sách KHÔNG lọc — dùng dựng option bộ lọc (phân khu/loại theo data thật).
  const { data: allData } = useQuery({
    queryKey: ["admin-inventory", "all"],
    queryFn: () => listInventory(),
  });

  const phanKhuOptions = useMemo(() => {
    const set = new Set<string>(PHAN_KHU_OPTIONS);
    for (const u of allData?.units ?? []) if (u.phan_khu) set.add(u.phan_khu);
    return Array.from(set);
  }, [allData]);

  const loaiOptions = useMemo(() => {
    const set = new Set<string>(LOAI_OPTIONS);
    for (const u of allData?.units ?? []) if (u.loai) set.add(u.loai);
    return Array.from(set);
  }, [allData]);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin-inventory"] });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteUnit(id),
    onSuccess: () => {
      invalidate();
      setConfirmDeleteUnit(null);
    },
  });

  const units = useMemo(() => data?.units ?? [], [data]);

  const stats = useMemo(() => {
    let conHang = 0;
    let datCoc = 0;
    let daBan = 0;
    for (const u of units) {
      if (u.trang_thai === "Còn hàng") conHang += 1;
      else if (u.trang_thai === "Đặt cọc") datCoc += 1;
      else if (u.trang_thai === "Đã bán") daBan += 1;
    }
    return { total: units.length, conHang, datCoc, daBan };
  }, [units]);

  function openCreate() {
    setEditingUnit(null);
    setModalOpen(true);
  }

  function openEdit(unit: InventoryUnit) {
    setEditingUnit(unit);
    setModalOpen(true);
  }

  return (
    <div>
      <PageHeader
        title="Quỹ căn"
        description="Quản lý quỹ căn ELC: bộ lọc, chỉnh giá & trạng thái, sơ đồ mặt bằng."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw
                className={isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              Làm mới
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4" />
              Thêm căn
            </Button>
          </div>
        }
      />

      <InventorySyncCard onSynced={() => refetch()} />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Tổng" value={stats.total} />
        <StatCard label="Còn hàng" value={stats.conHang} accent="success" />
        <StatCard label="Đặt cọc" value={stats.datCoc} accent="warning" />
        <StatCard label="Đã bán" value={stats.daBan} accent="muted" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Phân khu</Label>
          <Select
            value={filters.phan_khu}
            onChange={(e) =>
              setFilters((f) => ({ ...f, phan_khu: e.target.value }))
            }
          >
            <option value="">Tất cả</option>
            {phanKhuOptions.map((pk) => (
              <option key={pk} value={pk}>
                {pk}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Loại</Label>
          <Select
            value={filters.loai}
            onChange={(e) =>
              setFilters((f) => ({ ...f, loai: e.target.value }))
            }
          >
            <option value="">Tất cả</option>
            {loaiOptions.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Trạng thái</Label>
          <Select
            value={filters.trang_thai}
            onChange={(e) =>
              setFilters((f) => ({ ...f, trang_thai: e.target.value }))
            }
          >
            <option value="">Tất cả</option>
            {TRANG_THAI_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="mb-4">
        <Tabs
          tabs={[
            {
              key: "table",
              label: "Bảng",
              icon: <LayoutGrid className="h-4 w-4" />,
            },
            { key: "map", label: "Bản đồ", icon: <Map className="h-4 w-4" /> },
          ]}
          value={view}
          onChange={(k) => setView(k as View)}
        />
      </div>

      {view === "table" ? (
        <InventoryTable
          units={units}
          isLoading={isLoading}
          onEdit={openEdit}
          onDelete={setConfirmDeleteUnit}
        />
      ) : (
        <InventoryMap units={units} onSelect={openEdit} />
      )}

      <UnitEditModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={invalidate}
        editing={editingUnit}
      />

      <Dialog
        open={Boolean(confirmDeleteUnit)}
        onClose={() => setConfirmDeleteUnit(null)}
      >
        <DialogHeader
          title="Xoá căn?"
          description="Hành động này sẽ xoá căn khỏi quỹ căn."
          onClose={() => setConfirmDeleteUnit(null)}
        />
        <DialogBody>
          <p className="text-sm">
            Bạn chắc chắn muốn xoá căn <b>{confirmDeleteUnit?.id}</b> (
            {confirmDeleteUnit?.phan_khu})?
          </p>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setConfirmDeleteUnit(null)}
          >
            Huỷ
          </Button>
          <Button
            variant="danger"
            disabled={deleteMut.isPending}
            onClick={() =>
              confirmDeleteUnit && deleteMut.mutate(confirmDeleteUnit.id)
            }
          >
            {deleteMut.isPending ? "Đang xoá…" : "Xoá căn"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "success" | "warning" | "muted";
}) {
  const accentClass =
    accent === "success"
      ? "text-success"
      : accent === "warning"
        ? "text-warning"
        : accent === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <Card className="p-4">
      <p className="text-xs uppercase text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${accentClass}`}>{value}</p>
    </Card>
  );
}
