# GenAI Insight Engine

One validated, provider-independent layer accepts structured output from Customer, Invoice & Collection, Inventory, Cash Flow, Sales, and Transaction Anomaly intelligence. It makes one OpenAI-compatible structured LLM call per insight using `LLM_API_KEY`, `LLM_MODEL`, and `LLM_BASE_URL`.

The pipeline validates non-empty input, builds a deterministic domain prompt, parses JSON, validates Pydantic output, and rejects malformed responses. It never creates fallback AI content. Prompts require facts-only explanations, separate ML predictions from business rules, and prohibit guaranteed outcomes. Anomaly prompts explicitly state that anomaly is not fraud.

Endpoints are `/ai/insight/{customer,invoice,inventory,cash-flow,sales,anomaly}` and `/ai/insight`. Requests contain `{"intelligence": {...}}`; successful responses contain `{"status":"success","insight":{...}}`. Missing configuration produces HTTP 503; malformed LLM output produces HTTP 502.

No RAG, agents, frontend, or new ML model is included. Mocked tests work without credentials; live LLM validation requires configured credentials.
