import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sanitizeText(value: string | null | undefined, maxLength = 500) {
  if (!value) {
    return "";
  }

  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function slugify(value: string) {
  return sanitizeText(value, 120)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function isTruthy<T>(value: T | null | undefined | false): value is T {
  return Boolean(value);
}

export function formatPhoneNumber(value: string | null | undefined) {
  return sanitizeText(value, 40).replace(/[^\d+ ]/g, "");
}
