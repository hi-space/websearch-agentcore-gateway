# 하나의 게이트웨이, 세 개의 거버넌스: LLM·Tool·Agent를 묶을 때 공짜가 아닌 것들

> AWS Bedrock AgentCore Gateway로 AI 자원을 거버닝하면서 배운, 문서에 없는 이야기

**대상 독자:** 엔터프라이즈 의사결정자, 플랫폼·보안 아키텍트
**한 줄 요약:** 게이트웨이로 Tool·LLM·Agent를 모으면 "연결"은 그날 얻지만, Identity·Cost·Contract라는 세 개의 갭은 당신이 직접 설계해야 한다.

---

## 들어가며: "다 붙는다"는 말의 함정

2026년 6월, AWS Bedrock AgentCore Gateway는 한 문장으로 자신을 소개한다.

> *"a single, secure entry point for agentic traffic — connecting agents to tools, to other agents, and to large language models (LLMs)."*
> — [AgentCore Gateway 공식 문서](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html)

번역하면 "에이전트 트래픽을 위한 단일 보안 진입점 — 에이전트를 도구에, 다른 에이전트에, 그리고 LLM에 연결한다." 마케팅 문구로는 완벽하다. 실제로 타겟 유형도 세 계열로 GA됐다. 도구를 묶는 MCP 타겟(Lambda·OpenAPI·MCP 서버·빌트인 커넥터), LLM을 라우팅하는 Inference 타겟(Bedrock·OpenAI·Anthropic), 그리고 에이전트를 잇는 HTTP passthrough 타겟(Agent·A2A)이다.

나는 이 게이트웨이 뒤에 11개의 웹 검색·추출 엔진을 실제로 붙여 운영하는 프로젝트를 만들었다. 처음 목표는 단순했다 — 여러 검색 MCP를 한 게이트웨이로 통합해 성능을 벤치마크하고, Bedrock 기반 어시스턴트가 갖지 못한 웹 검색 능력을 메우는 것. 그런데 붙이고 운영하면서 깨달은 진실은 마케팅 문구와 결이 달랐다.

**연결(connectivity)은 정말로 그날 바로 얻는다. 그러나 거버넌스(governance)는 공짜가 아니다.**

게이트웨이는 "에이전트가 도구를 호출할 수 있게" 해주지만, 기업이 진짜 묻는 질문 — *"누가 호출했나, 비용은 누가 무나, 응답을 어떻게 신뢰하나"* — 에는 답하지 않는다. 이 글은 그 세 개의 갭을 LLM·Tool·Agent라는 세 렌즈로 들여다본다. 각 렌즈는 독립적으로 읽힌다. 자신의 관심사부터 읽어도 좋다.

---

## 렌즈 1 — Tool Gateway: 가장 단단하고, 가장 함정이 많다

도구를 게이트웨이 뒤로 추상화하는 것은 세 렌즈 중 가장 성숙한 영역이다. 내 프로젝트가 실제로 11개 엔진(Serper, Exa, DuckDuckGo, Perplexity, Brave, Anthropic, Firecrawl, You.com, Tavily, SearXNG, Browser)과 AWS 관리형 Web Search 커넥터를 운영한 곳이기도 하다. 그리고 정확히 그래서, 함정이 가장 선명하게 보였다.

### T1. 신원 전파의 비대칭 — "게이트웨이는 당신이 누군지 확인하지만, 도구에겐 안 알려준다"

이게 가장 비싼 교훈이었다.

게이트웨이는 inbound 인증을 확실히 한다. 내 프로젝트는 Cognito 기반 CUSTOM_JWT authorizer와 allowed-clients 목록으로 "허가된 클라이언트만 도구를 호출"하도록 통제한다. 여기까진 교과서대로다.

문제는 그다음이다. 게이트웨이가 검증한 신원(JWT claims)은 **다운스트림 Lambda의 `clientContext`로도, CloudWatch telemetry로도 전파되지 않는다.** 즉 도구 입장에서는 "누가 나를 불렀는지" 알 길이 없다. 메트릭 차원을 봐도 `Operation`, `Protocol`, `Method`, `Resource`, `Name`뿐, caller identity는 없다 ([observability 메트릭 문서](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-gateway-metrics.html)).

호출자 신원은 오직 한 곳, **CloudTrail 데이터 이벤트의 `sub` claim**에만 남는다 ([CloudTrail 로그 해석 문서](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/understanding-gateway-cloudtrail-log-entries.html)).

이게 왜 중요한가? "도구 호출을 사용자·팀 단위로 인가하거나 과금(showback)하겠다"는 흔한 엔터프라이즈 요구사항이 게이트웨이만으로는 **불가능**하다는 뜻이다.

**현실적인 답:**
- 도구가 호출자를 알아야 한다면 → 신원을 주입하는 **Request Interceptor Lambda**를 앞단에 둔다.
- 감사가 목적이라면 → CloudTrail의 `sub`(누가)와 vended log의 `trace_id`(무엇을)를 **조인**해 재구성한다.

> **의사결정자 함의:** "per-user 도구 정책"이나 "팀별 도구 쇼백"을 기대했다면, 그건 게이트웨이가 주는 기능이 아니라 당신이 추가로 설계할 비용이다. 예산과 일정에 반영하라.

### T2. Tool Sprawl와 "컨텍스트 세금" — 도구가 많아질수록 모델이 못 고른다

게이트웨이에 도구를 붙이는 건 쉽다. 너무 쉬워서 문제다. 도구가 수십, 수백 개가 되면 새로운 병목이 생긴다 — **인프라가 아니라 모델의 선택 능력**이다.

LLM은 사용 가능한 도구 목록(tool definitions)을 프롬프트 컨텍스트에 담아 받는다. 도구가 많아질수록 이 정의가 컨텍스트를 잠식하고("컨텍스트 세금"), 모델이 올바른 도구를 고를 확률은 오히려 떨어진다.

AWS의 답은 게이트웨이 내장 **Semantic tool search**(`x_amz_bedrock_agentcore_search`)다. 작업 맥락에 맞는 도구만 자연어로 검색해 좁혀준다 ([semantic search 문서](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-using-mcp-semantic-search.html)). 내 프로젝트도 게이트웨이를 `search_type=SEMANTIC`으로 설정해 11개 엔진을 다룬다.

> **인사이트:** "게이트웨이엔 도구를 무한정 붙일 수 있다"는 말의 진짜 제약은 서비스 한도가 아니라 모델의 도구 선택 정확도다. 그래서 카탈로그 거버넌스(현재 Preview인 AgentCore Registry 같은 "도구·에이전트·MCP 서버의 governed catalog")가 다음 단계의 답이 된다.

### T3. 응답 계약(Contract)은 게이트웨이가 주지 않는다 — 정규화는 당신 몫

멀티-프로바이더 게이트웨이의 숨은 작업량은 "연결"이 아니라 "정규화"에 있다.

11개 검색 엔진은 응답 스키마가 제각각이다. 어떤 엔진은 관련도 `score`를 주고 어떤 엔진은 안 준다. `publishedDate` 포맷이 다르고, Perplexity·Anthropic처럼 합성된 `answer`를 주는 엔진도 있다. **게이트웨이는 이걸 통일해주지 않는다.** 라우팅과 프로토콜(MCP)은 통일해주지만, 응답 본문 스키마는 타겟이 주는 그대로 흘려보낸다.

그래서 내 프로젝트는 `tools/_shared/response.py`에 공통 `SearchResponse` 계약을 직접 설계했다 — `{title, url, snippet, score?, published_at?}` 형태로 모든 엔진을 정규화하고, `engine`·`latency_ms`·`answer?`를 덧붙인다. 그리고 AWS 관리형 Web Search 커넥터는 또 다른 스키마(`{text, url, title, publishedDate}`)를 반환하기 때문에, 이것 역시 같은 계약으로 매핑하는 별도 코드가 필요했다.

> **인사이트:** 응답 계약을 한 번 표준화해두면, 그때부터 프로바이더 스왑은 진짜로 무비용이 된다. 에이전트 코드는 `SearchResponse`만 알면 되고, 뒤의 엔진이 Serper든 Brave든 관리형 커넥터든 신경 쓰지 않는다. 이게 게이트웨이 추상화의 진짜 ROI다 — 단, 그 계약을 당신이 설계했을 때만.

### 보너스 — egress 통제: self-managed vs 관리형의 갈림길

규제 워크로드라면 한 가지가 더 중요하다. 데이터가 AWS 밖으로 나가도 되는가?

| 측면 | self-managed 검색 MCP (11종) | 관리형 Web Search 커넥터 |
|---|---|---|
| API 키 | 엔진별 필요 (Secrets Manager 보관) | **불필요** |
| 데이터 egress | 서드파티 검색엔진으로 쿼리 전송 | **AWS 밖으로 안 나감** |
| 입력 스키마 | 엔진별 상이 | `query`(≤200자), `maxResults`(1–25) |
| 커스터마이징 | 엔진·랭킹·추출 자유 선택 | 도메인 denylist |
| 리전 | 게이트웨이 리전 따름 | us-east-1 단독 |
| Terraform | 네이티브 지원 | 미지원 (CLI 우회) |

출처: [Web Search Tool 커넥터 문서](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html)

흥미로운 점은 둘이 **같은 게이트웨이에서 공존**한다는 것이다. "쿼리가 AWS를 절대 못 떠나는" 규제 데이터에는 관리형 커넥터를, 검색 품질·랭킹·추출을 튜닝하거나 벤더를 벤치마크해야 하는 워크로드에는 self-managed를 — 에이전트는 둘 다 같은 도구 인터페이스로 본다.

---

## 렌즈 2 — LLM Gateway: 비용이라는 보이지 않는 갭

> 이 영역은 AWS 기능으로는 GA됐지만 내 프로젝트엔 아직 구현하지 않았다. 그래서 여기서는 "이 게이트웨이를 LLM Gateway로 쓸 때 기업이 부딪힐 비자명한 지점"을 설계 관점에서 짚는다.

### L1. 멀티-프로바이더 라우팅 — 속도가 아니라 거버넌스가 본질

Inference 타겟을 쓰면 Bedrock, OpenAI, Anthropic 모델을 단일 엔드포인트 뒤에 둘 수 있다 ([inference connector 문서](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-inference-connector.html)). 게이트웨이는 *"model-based routing of inference traffic across providers"*를 표방한다.

이걸 "지연 줄이기"나 "편의 기능"으로 읽으면 핵심을 놓친다. LLM Gateway의 본질 가치는 두 가지다.

- **벤더 lock-in 회피:** 라우팅과 정책이 게이트웨이에 있으니, 모델을 갈아끼워도 애플리케이션 코드는 불변이다. 모델 가격이 바뀌거나 더 나은 모델이 나오면 라우팅 규칙만 바꾼다.
- **모델 거버넌스:** "어떤 팀이 어떤 모델을, 어떤 조건으로" 쓸 수 있는지를 중앙에서 통제한다.

### L2. 비용·토큰 거버넌스의 공백 — "게이트웨이는 비용을 안 알려준다"

여기가 LLM Gateway에서 가장 자주 간과되는 갭이다.

게이트웨이는 호출 수(`Invocations`)와 지연(`Latency`, `Duration`)은 메트릭으로 준다. 그러나 **토큰 수도, 비용도 발행하지 않는다.** 내 프로젝트의 관측 문서에 이렇게 적어뒀다.

> *"Gateway 자체에서는 토큰 수나 비용 메트릭을 직접 발행하지 않습니다. 비용 추정은 호출 수와 엔진별 단가표를 조합하여 산출해야 합니다."*
> — `docs/03-observability.md` §1.5

즉 "팀별 LLM 쿼터"나 "모델 사용 쇼백"을 게이트웨이 메트릭만으로는 만들 수 없다. 실제 토큰·비용은 Bedrock의 Usage 메트릭을 별도로 조회해야 한다.

**현실적인 답:**
- 1차 추정: `Invocations × 엔진별 단가`로 근사치를 낸다. 이 프로젝트의 대시보드(`/observability`)에는 실제로 이 계산을 하는 **"비용 추정 ★" 카드**가 있다 — CloudWatch `Invocations`를 엔진별 단가표(`lib/cost.ts`)와 곱해 게이트웨이 전체·엔진별 추정 비용을 보여주고, 별표로 "추정치이며 정확한 청구는 Bedrock Usage / Cost Explorer 확인"임을 명시한다.
- 정밀 청구: Bedrock 콘솔 / Cost Explorer로 교차검증한다.
- 단, 현재 카드는 **게이트웨이 전체·엔진별** 추정까지다. **팀·사용자별 쇼백(showback)**은 여기서 한 걸음 더 필요하다 — 렌즈 1의 신원 문제(T1)에서 만든 호출자 신원(`caller_identity`)을 비용 집계에 조인해야 비로소 "어느 팀이 얼마를 썼나"가 나온다. 신원 없이는 팀별 비용 귀속도 불가능하기 때문이다.

> **인사이트:** LLM Gateway를 FinOps 통제점으로 쓰고 싶다면, 비용 가시성 레이어를 직접 얹어야 한다. 게이트웨이는 "얼마나 자주" 호출됐는지는 알려주지만 "얼마가 들었는지"는 알려주지 않는다.

---

## 렌즈 3 — Agent Gateway: 신뢰 경계가 증폭되는 곳

> 이 영역도 AWS 기능으로는 GA됐으나 내 프로젝트엔 미구현이다. 설계 관점으로 서술한다.

### A1. Agent-as-Tool / A2A 합성 — 편리함과 함께 오는 위험

HTTP passthrough 타겟으로 AgentCore Runtime 에이전트와 Agent-to-Agent(A2A) 서비스를 게이트웨이에 붙일 수 있다 ([HTTP runtime 타겟](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-http-runtime.html), [A2A 문서](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html)). 한 에이전트가 다른 에이전트를 도구처럼 호출하고, 조직의 에이전트를 재사용 가능한 자원으로 카탈로그화할 수 있다.

문제는 **에이전트가 에이전트를 부르는 순간, 렌즈 1의 신원 전파 문제(T1)가 멀티홉으로 증폭**된다는 점이다. 사용자 → 에이전트 A → 에이전트 B로 이어지는 체인에서, B는 원래 사용자가 누구인지 어떻게 아는가? 권한은 어떻게 위임되는가?

답의 일부는 게이트웨이의 outbound 인증에 있다. OAuth 2.0 **token exchange(on-behalf-of)** 흐름을 쓰면 호출자의 신원을 위임 토큰으로 다음 홉에 전달할 수 있다 ([outbound auth 문서](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-outbound-auth.html)). 그러나 이건 설계해야 작동하는 것이지, 붙인다고 저절로 되는 게 아니다.

### A2. 멀티홉 분산 추적 — 보이지만 "누가"가 빠진 추적

A2A 체인은 OTEL 스팬과 `trace_id`로 추적된다. X-Ray Transaction Search에서 홉별 워터폴을 볼 수 있다. 그런데 렌즈 1에서 말한 그 문제가 여기서 다시 돌아온다 — 각 홉의 telemetry에는 caller identity가 없다.

즉 "어떤 사용자의 요청이 이 에이전트 체인을 타고 흘렀는가"를 trace만으로는 복원할 수 없다.

> **인사이트:** Agent Gateway의 감사는 trace(무엇이 일어났나)와 CloudTrail(누가 시작했나)을 **반드시 조인**해야 완성된다. 단일 소스로 끝나는 감사는 환상이다. 멀티홉일수록 이 조인의 난이도는 올라간다.

---

## 관통 결론: 게이트웨이가 메워주지 않는 세 개의 갭

세 렌즈를 따로 봤지만, 같은 교훈이 반복적으로 튀어나왔다. 이걸 한 장으로 수렴하면 다음과 같다.

| 갭 | 게이트웨이가 주는 것 | 게이트웨이가 **안 주는 것** | 기업이 직접 설계할 것 |
|---|---|---|---|
| **Identity** | inbound JWT 검증, allowed-clients | downstream·telemetry로 신원 전파 ✗ | Request Interceptor + CloudTrail `sub` 조인 |
| **Cost** | 호출 수·지연 메트릭 | 토큰·비용 메트릭 ✗ | 미터링·쇼백 레이어 (Invocations×단가 + Bedrock Usage) |
| **Contract** | 라우팅·프로토콜(MCP) 통일 | 응답 스키마 정규화 ✗ | 공통 응답 계약 (`SearchResponse`류) |

이 표가 이 글의 핵심이다. Tool이든 LLM이든 Agent든, 게이트웨이는 **연결과 인증의 진입점**을 주지만 **신원·비용·계약**은 당신의 설계 영역으로 남긴다.

### 그래서, 도입 기업은 무엇을 얻는가

비관적으로 들렸다면 오해다. 핵심은 이거다.

**게이트웨이 도입의 진짜 ROI는 "연결 비용 절감"이 아니라, 세 갭을 한 번 제대로 설계해두면 Tool·LLM·Agent 전반에 그 설계가 재사용된다는 점이다.** 신원 전파 패턴 하나, 미터링 레이어 하나, 응답 계약 하나를 세워두면 — 새 도구를 붙이든, 새 모델을 라우팅하든, 새 에이전트를 합성하든 거버넌스가 자동으로 따라온다. 이게 단일 통제 평면(control plane)의 가치다.

### 운영 현실 경고: GA ≠ Terraform 지원 ≠ 전 리전 가용

마지막으로, 신규 서비스를 프로덕션에 올릴 때 반드시 알아야 할 3단 갭이 있다. 관리형 Web Search 커넥터가 좋은 예다. 기능은 2026년 6월 GA됐지만 —

1. `hashicorp/aws` Terraform provider가 아직 connector 타겟을 지원하지 않아 CLI 우회가 필요했고(provider 스키마를 직접 덤프해 확인),
2. us-east-1 단독 가용이라 다른 리전 게이트웨이에는 직접 붙지 않아 멀티리전 설계를 강제했다.

(상세: `docs/research/agentcore-web-search-terraform.md`)

> **함의:** **기능 GA는 "쓸 수 있다"가 아니다.** Terraform 지원 여부, 리전 가용성, SDK 성숙도까지 확인해야 진짜 도입 가능 시점이 나온다. 도입 타임라인을 이 갭에 맞춰 잡아라.

거버넌스를 진지하게 본다면 컴플라이언스 자산도 챙길 만하다 — AgentCore는 SOC 1/2/3, ISO, CSA STAR 인증 범위에 들어간다 ([release notes](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/release-notes.html)).

---

## 맺으며

"AI를 게이트웨이 하나로 묶을 수 있다"는 말은 사실이다. 하지만 그건 시작이지 끝이 아니다. 연결은 게이트웨이가 주고, 거버넌스는 당신이 설계한다. Identity·Cost·Contract — 이 세 갭을 인지하고 들어가는 팀과, "다 붙는다"는 말만 믿고 들어가는 팀의 6개월 뒤 모습은 완전히 다를 것이다.

게이트웨이는 AI 자원의 통제 평면이 될 수 있다. 단, 그 통제를 채우는 것은 여전히 당신의 몫이다.

---

### 참고 자료

- [AgentCore Gateway 개요](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway.html)
- [Gateway 핵심 개념·타겟 유형](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-core-concepts.html)
- [Inference 타겟 (LLM 라우팅)](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-inference-connector.html)
- [HTTP/Agent/A2A 타겟](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-a2a.html)
- [Inbound / Outbound 인증](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-outbound-auth.html)
- [Semantic tool search](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-using-mcp-semantic-search.html)
- [관측 메트릭](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-gateway-metrics.html) · [CloudTrail 신원 로그](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/understanding-gateway-cloudtrail-log-entries.html)
- [Web Search Tool 커넥터](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/gateway-target-connector-web-search-tool.html)
- [Release notes (2026)](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/release-notes.html)
