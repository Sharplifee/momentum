import { requireStaff } from "@/lib/crm";
import { redirect, notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function TestPage() {
  await requireStaff(["owner"]);
  const allowed = process.env.NEXT_PUBLIC_DEV_TOOLS === "1" || process.env.VERCEL_ENV !== "production";
  if (!allowed) notFound();
  redirect("/crm/settings/developer");
}
