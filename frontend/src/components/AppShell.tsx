"use client";

import { usePathname } from "next/navigation";

import AdminShell from "@/components/admin/AdminShell";
import DoctorShell from "@/components/doctor/DoctorShell";
import PatientShell from "@/components/patient/PatientShell";
import { useAuth } from "@/contexts/AuthContext";

/** Picks the Figma frame for the signed-in role: the patient portal
 *  (06 Patient Screens), the admin console (05 Admin Screens) or the
 *  clinician workspace (02 Doctor Screens) — admins use the latter too. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const pathname = usePathname();
  if (profile?.role === "patient") return <PatientShell>{children}</PatientShell>;
  if (profile?.role === "admin" && pathname.startsWith("/admin")) return <AdminShell>{children}</AdminShell>;
  return <DoctorShell>{children}</DoctorShell>;
}
