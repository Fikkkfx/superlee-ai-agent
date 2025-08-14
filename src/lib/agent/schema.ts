// contoh aman untuk StoryHunt
import { z } from "zod";

export const StoryHuntToken = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  symbol: z.string(),
  name: z.string().optional(),
  decimals: z.number().int().min(0).max(255).optional(),
  aliases: z.array(z.string()).optional().default([]),
});

export const StoryHuntQuote = z.object({
  // angka dalam string (wei)
  amountOutRaw: z.string(),
  minAmountOutRaw: z.string().optional(),
  spender: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  // rute untuk aggregator; biarkan longgar agar kompatibel
  route: z.any().optional(),
  routes: z.array(z.any()).optional(),
  universalRoutes: z.array(z.any()).optional(),
});
