"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// Recharts se carga en un chunk aparte y solo en el navegador (no bloquea el primer render).
const loading = () => <Skeleton className="size-full rounded-lg" />;

export const MonthlyChart = dynamic(() => import("./charts").then((m) => m.MonthlyChart), { ssr: false, loading });
export const MrrByCategoryChart = dynamic(() => import("./charts").then((m) => m.MrrByCategoryChart), { ssr: false, loading });
export const DistributionChart = dynamic(() => import("./charts").then((m) => m.DistributionChart), { ssr: false, loading });
