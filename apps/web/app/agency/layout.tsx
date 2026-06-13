/**
 * Layout khu điều hành chủ sàn (Agency).
 *
 * Mobile-first: giới hạn bề ngang vừa màn hình điện thoại, để BottomNav (nhánh
 * agency) lo điều hướng. SiteShell ở root đã cung cấp header + padding đáy cho
 * thanh điều hướng dưới.
 */
export default function AgencyLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto w-full max-w-3xl pb-4">{children}</div>;
}
