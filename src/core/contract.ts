import { z } from "zod";

export const ScenarioSchema = z.enum([
  "healthy",
  "fallback",
  "timeout",
  "invalid",
  "refusal",
  "retry",
]);
export type Scenario = z.infer<typeof ScenarioSchema>;
export const scenarios: { id: Scenario; title: string; detail: string }[] = [
  {
    id: "fallback",
    title: "Fallback recovery",
    detail: "Atlas times out; Cedar returns a valid review.",
  },
  {
    id: "healthy",
    title: "Standard path",
    detail: "Atlas returns a valid structured review.",
  },
  {
    id: "retry",
    title: "Recoverable outage",
    detail: "Both fixtures fail once. An explicit retry recovers.",
  },
  {
    id: "timeout",
    title: "Deadline exceeded",
    detail: "Both fixtures exceed the local 25 ms deadline.",
  },
  {
    id: "invalid",
    title: "Invalid response",
    detail: "Both fixtures return schema-invalid output.",
  },
  {
    id: "refusal",
    title: "Provider refusal",
    detail: "A refusal stops routing; retry cannot bypass it.",
  },
];
export const AssetSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().regex(/^[a-z0-9-]+\.(svg|json|txt)$/),
    content: z.string().max(4096),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mediaType: z.string(),
  })
  .strict();
export const ManifestSchema = z
  .object({
    version: z.number().int().min(1).max(2),
    title: z.literal("Harbor launch kit"),
    durationSeconds: z.number().int().min(1).max(30),
    assets: z.array(AssetSchema).length(3),
  })
  .strict();
export type Manifest = z.infer<typeof ManifestSchema>;
export const ReviewSchema = z
  .object({
    summary: z.string().min(1).max(500),
    findings: z
      .array(
        z
          .object({
            assetId: z.string(),
            message: z.string().min(1).max(300),
            severity: z.enum(["info", "attention"]),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict();
export type Review = z.infer<typeof ReviewSchema>;
export const FailureSchema = z.enum([
  "timeout",
  "invalid_output",
  "refusal",
  "unavailable",
  "interrupted",
  "input_invalid",
  "delivery_failed",
]);
export type FailureCode = z.infer<typeof FailureSchema>;
export const AttemptSchema = z
  .object({
    provider: z.enum(["Atlas fixture", "Cedar fixture"]),
    outcome: z.enum([
      "valid",
      "timeout",
      "invalid_output",
      "refusal",
      "unavailable",
    ]),
    elapsedMs: z.number().nonnegative(),
    round: z.number().int().positive(),
  })
  .strict();
export type Attempt = z.infer<typeof AttemptSchema>;
export const AuditSchema = z
  .object({
    seq: z.number().int().positive(),
    at: z.string().datetime(),
    event: z.string(),
    inputVersion: z.number().int().positive(),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    result: z.string(),
  })
  .strict();
export type AuditEvent = z.infer<typeof AuditSchema>;
export const ApprovalSchema = z
  .object({
    inputVersion: z.number().int().positive(),
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    at: z.string().datetime(),
  })
  .strict();
export const DeliverySchema = z
  .object({
    directory: z.string(),
    bundleDigest: z.string().regex(/^[a-f0-9]{64}$/),
    files: z.array(
      z
        .object({
          name: z.string(),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict(),
    ),
  })
  .strict();
export const RunSchema = z
  .object({
    contractVersion: z.literal("switchyard.run.v1"),
    id: z.string().uuid(),
    scenario: ScenarioSchema,
    revision: z.number().int().nonnegative(),
    status: z.enum([
      "reviewing",
      "awaiting_approval",
      "failed",
      "rejected",
      "approved",
      "completed",
    ]),
    createdAt: z.string().datetime(),
    manifest: ManifestSchema,
    inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
    checks: z.array(
      z
        .object({
          assetId: z.string(),
          passed: z.boolean(),
          reason: z.string(),
        })
        .strict(),
    ),
    review: ReviewSchema.nullable(),
    attempts: z.array(AttemptSchema),
    round: z.number().int().nonnegative(),
    failure: z
      .object({ code: FailureSchema, message: z.string() })
      .strict()
      .nullable(),
    approval: ApprovalSchema.nullable(),
    delivery: DeliverySchema.nullable(),
    audit: z.array(AuditSchema),
  })
  .strict();
export type Run = z.infer<typeof RunSchema>;
export const CommandSchema = z
  .object({
    action: z.enum(["retry", "approve", "deliver", "reject", "revise"]),
    expectedRevision: z.number().int().nonnegative(),
  })
  .strict();
export type Command = z.infer<typeof CommandSchema>;
export const statusLabel: Record<Run["status"], string> = {
  reviewing: "Reviewing",
  awaiting_approval: "Awaiting approval",
  failed: "Review failed",
  rejected: "Rejected",
  approved: "Approved · delivery pending",
  completed: "Completed",
};
