import type { Metadata } from "next";
import { LeadsDesk } from "./desk";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Leads · Tal", robots: { index: false, follow: false } };

/** The US desk: applications from "/". */
export default function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LeadsDesk market="us" searchParams={searchParams} />;
}
