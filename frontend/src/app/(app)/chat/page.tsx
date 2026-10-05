"use client";

import ClinicianChat from "@/components/doctor/ClinicianChat";
import PatientChat from "@/components/patient/PatientChat";
import { useAuth } from "@/contexts/AuthContext";

/** Patients get the Figma "AI Chat" portal page; doctors and admins the
 *  "rag-assistant" page with the cited sources beside the conversation. */
export default function ChatPage() {
  const { profile } = useAuth();
  return profile?.role === "patient" ? <PatientChat /> : <ClinicianChat />;
}
