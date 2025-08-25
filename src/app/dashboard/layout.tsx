// src/app/dashboard/layout.tsx
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Registered IP — Superlee AI Agent",
  description: "List of your registered IP assets on Story.",
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
