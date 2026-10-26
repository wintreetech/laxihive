import { PrismaClient, Prisma } from "@prisma/client";
export const db = new PrismaClient();
export async function atomic<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let i = 0; i < 5; i++) {
    try {
      return await db.$transaction(fn, { timeout: 15000 });
    } catch (e: any) {
      if (e.code !== "P2034" || i === 4) throw e;
    }
  }
  throw new Error("Transaction retry failed");
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function assert(
  value: unknown,
  status: number,
  message: string,
): asserts value {
  if (!value) throw new HttpError(status, message);
}
