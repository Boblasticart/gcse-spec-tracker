import { resendOtpRoute } from "@/server/auth/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = resendOtpRoute;
