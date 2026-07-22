import { createServerFn } from "@tanstack/react-start";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider, getLovableAiGatewayResponseHeaders } from "./pricing-ai.server";

const PackageSuggestionSchema = z.object({
  name: z.string(),
  cadence: z.string(),
  daysPerMonth: z.number(),
  hoursPerMonth: z.number(),
  monthlyFee: z.number(),
  annualizedFee: z.number(),
  rationale: z.string(),
  idealFor: z.string(),
});

const SuggestPackagesOutputSchema = z.object({
  packages: z.array(PackageSuggestionSchema),
  summary: z.string(),
});

const SuggestPackagesInputSchema = z.object({
  baselineComp: z.number(),
  hourlyMid: z.number(),
  hourlyLo: z.number(),
  hourlyHi: z.number(),
  dailyMid: z.number(),
  goal: z.string(),
});

export type SuggestedPackage = z.infer<typeof PackageSuggestionSchema>;
export type SuggestPackagesResult = z.infer<typeof SuggestPackagesOutputSchema>;

export const suggestPackages = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SuggestPackagesInputSchema.parse(input))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      throw new Error("Missing LOVABLE_API_KEY");
    }

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3.6-flash");

    const prompt = buildPrompt(data);

    try {
      const { output, response } = await generateText({
        model,
        output: Output.object({ schema: SuggestPackagesOutputSchema }),
        prompt,
      });

      return Response.json(
        { output },
        { headers: getLovableAiGatewayResponseHeaders(response.headers) },
      );
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        return Response.json(
          { output: null, error: "Could not generate a valid package design. Please try again." },
          { status: 422 },
        );
      }
      throw error;
    }
  });

function buildPrompt(data: z.infer<typeof SuggestPackagesInputSchema>): string {
  return `You are a fractional consulting pricing strategist.

Given the following FTE baseline and calculated rate range, design 1–3 fractional consulting packages for the user.

FTE baseline: ${fmtUSD(data.baselineComp)}
Calculated hourly rate range: ${fmtUSD(data.hourlyLo)} – ${fmtUSD(data.hourlyHi)} (midpoint ${fmtUSD(data.hourlyMid)})
Calculated daily rate midpoint: ${fmtUSD(data.dailyMid)}

User goal / constraints:
"""${data.goal}"""

Design practical packages. Each package should include:
- A clear name (e.g., "Advisory Retainer", "Fractional Partner")
- Cadence description (e.g., "1 day/week")
- daysPerMonth (numeric, approximate)
- hoursPerMonth (numeric, approximate)
- monthlyFee (numeric USD, based on the hourly/daily rates)
- annualizedFee (numeric USD, monthlyFee × 12)
- rationale (1–2 sentences explaining the math and positioning)
- idealFor (1 sentence describing the client scenario)

Also include a short summary (1–2 sentences) of the overall strategy.

Return ONLY the structured JSON object matching the requested schema. Do not include markdown formatting or extra commentary.`;
}

function fmtUSD(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  });
}
