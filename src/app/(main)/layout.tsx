import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { NotifyProvider } from "@/lib/data/notify";
import { DataProvider } from "@/lib/data/store";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <DataProvider>
        <NotifyProvider>
          <AppShell>{children}</AppShell>
        </NotifyProvider>
      </DataProvider>
    </AuthGate>
  );
}
