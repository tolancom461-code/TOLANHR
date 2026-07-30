import crypto from "crypto";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /**
   * معرّف موحّد لكل طلب HTTP وارد — يُولَّد مرة واحدة هنا ويُمرَّر لكل
   * استدعاءات logAuditV2 خلال نفس الطلب، لربط كل الأحداث الناتجة عن
   * إجراء واحد ببعضها (FR-009).
   */
  requestId: string;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    requestId: crypto.randomUUID(),
  };
}
