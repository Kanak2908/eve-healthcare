import { Prisma } from "@prisma/client";

export function toMoney(value: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(value).toFixed(2);
}

export function parseMoney(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
