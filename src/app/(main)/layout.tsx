import { AppShell } from "@/components/app-shell";
import { AuthGate } from "@/components/auth-gate";
import { DataProvider } from "@/lib/data/store";

export default function MainLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthGate>
      <DataProvider>
        <AppShell>{children}</AppShell>
      </DataProvider>
    </AuthGate>
  );
}
