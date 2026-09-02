import { z } from "zod";

export const leadIntakeSchema = z.object({
  full_name: z.string().min(2).max(120),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional().or(z.literal("")).optional(),
  address: z.string().min(4).max(200),
  city: z.string().min(2).max(80).optional(),
  service_interest: z.string().max(80).optional(),
  requested_window: z.string().max(80).optional(),
  // multi-select day preferences from the public quote form; Nora reads these back
  requested_days: z.array(z.string().max(20)).max(7).optional(),
  fbclid: z.string().max(300).optional(),
  fbp: z.string().max(300).optional(),
  fbc: z.string().max(300).optional(),
  utm: z
    .object({
      source: z.string().optional(),
      medium: z.string().optional(),
      campaign: z.string().optional(),
      content: z.string().optional(),
      term: z.string().optional(),
    })
    .optional(),
  landing_page: z.string().max(500).optional(),
  referrer: z.string().max(500).optional(),
  // honeypot — real users never fill this in; bots that autofill every field do
  company_website: z.string().optional(), // honeypot — validated permissively so bots get a SILENT ok (route branch), not a 400 tell
  // alias honeypot used by the live Claude Design form
  company: z.string().optional(), // honeypot alias
});

export type LeadIntake = z.infer<typeof leadIntakeSchema>;
