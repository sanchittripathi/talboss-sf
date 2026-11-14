import type { Metadata } from "next";
import { LeadsDesk } from "../desk";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Leads · India · Tal", robots: { index: false, follow: false } };

/** The India desk: applications from "/pune". Same login as /leads. */
export default function PuneLeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <LeadsDesk market="india" searchParams={searchParams} />;
}
