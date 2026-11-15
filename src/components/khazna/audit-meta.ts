import { ArrowDownLeft, Ban, Building2, Edit3, FileDown, Layers, LogIn, ShieldCheck, Trash2, Upload, UserPlus, Users, type LucideIcon } from "lucide-react";
import type { AuditAction } from "@/lib/khazna/types";

export const AUDIT_ICON: Record<AuditAction, LucideIcon> = {
  LOGIN: LogIn,
  CREATE_ENTRY: ArrowDownLeft,
  EDIT_ENTRY: Edit3,
  VOID_ENTRY: Ban,
  DELETE_ENTRY: Trash2,
  BULK_POST: Layers,
  EDIT_BATCH: Edit3,
  VOID_BATCH: Ban,
  DELETE_BATCH: Trash2,
  ADD_STUDENT: UserPlus,
  EDIT_STUDENT: Edit3,
  DELETE_STUDENT: Trash2,
  IMPORT_STUDENTS: Upload,
  ASSIGN_SECTOR: Users,
  INVITE_ADMIN: UserPlus,
  EDIT_ADMIN: Edit3,
  DELETE_ADMIN: Trash2,
  UPDATE_SECTOR: Layers,
  UPDATE_PROFILE: Users,
  EXPORT: FileDown,
  ADD_SECTOR: Layers,
  EDIT_CLASS: Edit3,
  DELETE_CLASS: Trash2,
  SIGN_UP: Building2,
  UPDATE_INSTITUTION_PROFILE: Building2,
  ADD_SIGNATORY: ShieldCheck,
  EDIT_SIGNATORY: Edit3,
  DELETE_SIGNATORY: Trash2,
  REVOKE_REPORT: Ban,
  EXTEND_REPORT: FileDown,
};

export const auditTone = (a: AuditAction): "debit" | "credit" | "neutral" | "info" =>
  a.startsWith("VOID") ? "debit" : a === "BULK_POST" || a === "CREATE_ENTRY" ? "credit" : a === "LOGIN" || a === "EXPORT" ? "neutral" : "info";
