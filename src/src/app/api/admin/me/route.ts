import { NextResponse } from "next/server";
import { getAuthed } from "@/lib/admin";

export async function GET() {
  return NextResponse.json({ authed: await getAuthed() });
}
