# STRIDE Threat Model — search-agentcore-gateway v1.0

## Trust Boundaries

1. **Internet → CloudFront (admin) / Public MCP endpoint (Gateway)**
   - Threat: Unauthenticated access, DDoS
   - Mitigation: WAF rules on CloudFront; API Gateway rate limiting; Cognito JWT validation

2. **CloudFront → Admin Lambda Function URL (IAM-signed via OAC)**
   - Threat: Tampered requests from CDN edge
   - Mitigation: OAC signing; TLS 1.2+

3. **AgentCore Gateway → search-router Lambda (IAM)**
   - Threat: Unauthorized invocation of search logic
   - Mitigation: IAM role trust policy; least-privilege Lambda permissions

4. **search-router Lambda → Provider APIs (TLS, API key)**
   - Threat: API key leakage; provider compromise
   - Mitigation: Secrets Manager encryption; structured logging (no key emission); TLS-only

5. **Admin Lambda → DynamoDB / Secrets Manager / KMS (IAM)**
   - Threat: Privilege escalation; unauthorized data access
   - Mitigation: Least-privilege IAM policies; encryption at rest; resource-scoped actions

6. **Reconciler Lambda → AgentCore control plane (IAM)**
   - Threat: Unauthorized gateway modification
   - Mitigation: Least-privilege bedrock-agentcore:* actions; explicit role assumption

7. **DDB Streams → audit-export Lambda → S3 (Object Lock)**
   - Threat: Audit log tampering; deletion
   - Mitigation: S3 Object Lock (immutable); stream-based trigger (no manual delete)

---

## Per-Component STRIDE Analysis

### MCP Gateway Endpoint

**Spoofing (S):**
- Threat: Attacker claims to be a legitimate Cognito user
- Mitigation: Cognito JWT validation via `aws-jwt-verify`; token refresh window; role mapping is fixed in middleware

**Tampering (T):**
- Threat: MCP payload modified in transit
- Mitigation: TLS 1.2+; MCP-over-HTTPS only; no plain HTTP

**Repudiation (R):**
- Threat: Caller denies making a request
- Mitigation: AuditLogTable logs all search requests with caller identity; CloudTrail logs all AWS API calls

**Information Disclosure (I):**
- Threat: API keys, secrets leak in logs or error messages
- Mitigation: Structured logger redacts `apiKey`, `secret*` fields; error responses do not include internal details

**Denial of Service (D):**
- Threat: Quota exhaustion; resource starvation
- Mitigation: Hard quota enforced in search-router (per provider, per user); WAF rate limiting on admin path; DynamoDB on-demand billing

**Elevation of Privilege (E):**
- Threat: User claims higher permissions than assigned
- Mitigation: Groups → role mapping is fixed in middleware; no dynamic privilege escalation; bedrock-agentcore:PassRole denied

---

### Admin Console BFF

**Spoofing (S):**
- Threat: Attacker impersonates admin user
- Mitigation: Cognito authentication required; session tokens signed by Auth Lambda

**Tampering (T):**
- Threat: Admin request body modified; response manipulated
- Mitigation: TLS 1.2+; signed requests via OAC; response integrity via HTTPS

**Repudiation (R):**
- Threat: Admin denies making configuration change
- Mitigation: CloudTrail logs all UpdateConfig/DeleteProvider calls; audit timestamp in ConfigTable

**Information Disclosure (I):**
- Threat: Sensitive configuration (API key, webhook) exposed to non-admins
- Mitigation: ConfigTable encrypted at rest; admin-only IAM policy; Secrets Manager for keys (never in DDB)

**Denial of Service (D):**
- Threat: Admin API flooded; config updates fail
- Mitigation: Rate limiting on admin-lambda; on-demand DynamoDB; no expensive compute on config change

**Elevation of Privilege (E):**
- Threat: Regular user grants themselves admin role
- Mitigation: Role assignment in Cognito user groups; no self-modification; CloudTrail audit of group changes

---

### search-router Lambda

**Spoofing (S):**
- Threat: Attacker calls provider API as search-router
- Mitigation: Provider API keys stored in Secrets Manager; scoped to search-router role only

**Tampering (T):**
- Threat: Search request modified before calling provider; response modified before returning
- Mitigation: TLS to provider; signed request payload; response validation

**Repudiation (R):**
- Threat: User claims search never happened
- Mitigation: AuditLogTable records caller, query, timestamp; CloudWatch metrics; X-Ray tracing

**Information Disclosure (I):**
- Threat: Provider API key leaked; search query logged plaintext
- Mitigation: Secrets Manager encryption; structured logging redacts sensitive fields; no key in error responses

**Denial of Service (D):**
- Threat: Resource exhaustion; slow provider response
- Mitigation: Hard quota enforced; 12s timeout; CloudWatch circuit-breaker alarm

**Elevation of Privilege (E):**
- Threat: User bypasses quota to call unlimited searches
- Mitigation: QuotaTable enforces RPM and daily limits; deduplicated counter logic; TTL cleanup

---

### Reconciler Lambda

**Spoofing (S):**
- Threat: Unauthorized caller triggers reconciliation
- Mitigation: EventBridge scheduled rule only; Lambda assumes control-plane role

**Tampering (T):**
- Threat: Reconciliation state modified; drift detection bypassed
- Mitigation: CloudTrail immutable; S3 audit logs immutable (Object Lock)

**Repudiation (R):**
- Threat: Reconciler denies drift correction
- Mitigation: CloudTrail logs all bedrock-agentcore:UpdateGateway calls; timestamp recorded

**Information Disclosure (I):**
- Threat: Gateway configuration leaked during reconciliation
- Mitigation: Reconciler role scoped to bedrock-agentcore:* only; no S3 read access; no Secrets Manager access

**Denial of Service (D):**
- Threat: Reconciliation fails; gateway state unrecoverable
- Mitigation: Idempotent reconciliation; CloudTrail audit trail for replay; no destructive operations

**Elevation of Privilege (E):**
- Threat: Reconciler claims higher permissions to modify gateway
- Mitigation: Explicit iam:PassRole scope to gateway invoke role only; bedrock-agentcore:* actions verified

---

### Provider Secrets (Secrets Manager)

**Spoofing (S):**
- Threat: Attacker retrieves secret by impersonating search-router
- Mitigation: IAM role assumption verification; no cross-account access

**Tampering (T):**
- Threat: Secret value modified without audit
- Mitigation: Secrets Manager audit logging (CloudTrail); no direct update API for v1

**Repudiation (R):**
- Threat: Admin denies updating API key
- Mitigation: CloudTrail logs all GetSecretValue and UpdateSecret calls

**Information Disclosure (I):**
- Threat: Secret exposed via CloudWatch logs; error response; memory dump
- Mitigation: Structured logger redacts secret*; error responses generic; Lambda memory encrypted

**Denial of Service (D):**
- Threat: Secret rotation fails; provider calls fail
- Mitigation: Rotation handled via admin console; v1 does not auto-rotate

**Elevation of Privilege (E):**
- Threat: Non-search-router Lambda retrieves provider keys
- Mitigation: Resource policy on Secrets Manager limits GetSecretValue to search-router role ARN

---

### Audit Export Bucket

**Spoofing (S):**
- Threat: Unauthorized write to audit log bucket
- Mitigation: S3 bucket policy; IAM role scoping; no public access

**Tampering (T):**
- Threat: Audit logs modified; deleted
- Mitigation: S3 Object Lock in COMPLIANCE mode (immutable for 7 years); versioning enabled

**Repudiation (R):**
- Threat: Attacker denies audit log entry
- Mitigation: DDB Streams trigger immutable; stream processing function is deterministic

**Information Disclosure (I):**
- Threat: Audit logs (containing queries, timestamps, caller ID) exposed
- Mitigation: S3 block public access; bucket policy denies non-HTTPS; server access logging to separate bucket

**Denial of Service (D):**
- Threat: DDB stream processing fails; audit logs not exported
- Mitigation: Lambda retry policy; DLQ for failed events; CloudWatch alarm

**Elevation of Privilege (E):**
- Threat: User modifies audit trail via S3 API
- Mitigation: S3 Object Lock (immutable); no Put/Delete after write; no user IAM access to bucket

---

## Summary of Key Mitigations

| Category | Control | Status |
|----------|---------|--------|
| **Ingress** | CloudFront + WAF | Implemented v1.0 |
| **Identity** | Cognito + JWT + role mapping | Implemented v1.0 |
| **Secrets** | Secrets Manager + KMS | Implemented v1.0 |
| **Data at Rest** | KMS encryption on DDB, S3, logs | Implemented v1.0 |
| **Data in Transit** | TLS 1.2+ on all channels | Implemented v1.0 |
| **Audit** | CloudTrail + DDB Streams + S3 Object Lock | Implemented v1.0 |
| **Quota** | Hard limits in QuotaTable + alarms | Implemented v1.0 |
| **Least Privilege** | Explicit IAM policies (no wildcards in v1) | Ongoing (Tasks 2–7) |

---

## Deferred to v1.1+

- **Multi-tenancy isolation:** API key per tenant; rate limiting per tenant; separate audit streams
- **Secrets rotation:** Automated rotation lambda; provider API key versioning
- **Encryption key rotation:** KMS key auto-rotation (currently enabled but no use-case testing)
- **Incident response:** GuardDuty / Security Hub dashboards; incident playbook
