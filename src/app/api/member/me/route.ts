import { NextResponse } from "next/server";
import { getCurrentMember } from "@/lib/member-auth";

/* وضعیت نشست فعلی عضو */
export async function GET() {
  const member = await getCurrentMember();
  return NextResponse.json({ member });
}
