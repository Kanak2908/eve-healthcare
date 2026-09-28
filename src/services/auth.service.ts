import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { Prisma } from "@prisma/client";
import { env } from "../config";
import { AppError } from "../lib/errors";
import { prisma } from "../lib/prisma";

const dummyHashPromise = bcrypt.hash("dummy-password-not-used", env.bcryptRounds);

type PublicUser = {
  id: string;
  email: string;
  name: string;
};

function signToken(user: PublicUser): string {
  const options: SignOptions = { expiresIn: env.jwtExpiresIn as SignOptions["expiresIn"] };
  return jwt.sign({ sub: user.id, email: user.email }, env.jwtSecret, options);
}

function authResponse(user: PublicUser) {
  return { token: signToken(user), user };
}

export async function signup(input: { email: string; password: string; name: string }) {
  const passwordHash = await bcrypt.hash(input.password, env.bcryptRounds);
  try {
    const user = await prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        name: input.name,
        passwordHash,
      },
      select: { id: true, email: true, name: true },
    });
    return authResponse(user);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }
    throw error;
  }
}

export async function login(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  const dummyHash = await dummyHashPromise;
  const passwordOk = await bcrypt.compare(input.password, user?.passwordHash ?? dummyHash);
  if (!user || !passwordOk) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Invalid email or password");
  }
  return authResponse({ id: user.id, email: user.email, name: user.name });
}
