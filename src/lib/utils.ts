import { type ClassValue, clsx } from "clsx";
export type { WithoutChild, WithoutChildrenOrChild } from "bits-ui";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}
