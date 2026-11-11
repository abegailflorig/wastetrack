import { Outlet } from "react-router";

export default function PublicLayout() {
  return (
    <main className="min-h-[100dvh] w-full">
      <Outlet />
    </main>
  );
}