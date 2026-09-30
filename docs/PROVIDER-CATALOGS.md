# Provider catalogs

Updated and checked: 2026-09-21.

## Discovery

Startup, key additions, onboarding, advisor creation, and Refresh List use the same catalog service. Built-in providers load independently. Requests have a deadline even when the caller supplies a cancellation signal. Overlapping refreshes are deduplicated; cancelled requests cannot overwrite a later result.

| Provider | Discovery | Authentication | Handling |
| --- | --- | --- | --- |
| OpenRouter | GET /api/v1/models | Public; no key needed | Full catalog, text capabilities, context/output limits, supported parameters, pricing; batch-only entries excluded |
| Anthropic | GET /v1/models | x-api-key and anthropic-version | Follows has_more / last_id / after_id; reads token limits |
| OpenAI | GET /v1/models | Bearer | Filters known media, embedding, and Responses-only families from the Chat Completions picker |
| Google | GET /v1beta/models | X-Goog-Api-Key | Follows nextPageToken; requires generateContent; excludes dedicated media/live models |
| xAI | GET /v1/language-models | Bearer | Reads language modalities and native prices; converts USD cents per 100M tokens to dollars per token |
| DeepSeek | GET /v1/models | Bearer | Uses returned IDs rather than assuming the old chat/reasoner pair |
| Custom | Existing configured endpoint/adapter | User configuration | Remains user-defined |

An initial failure uses the offline shortlist. Later failures retain the last successful in-memory catalog. A successful empty catalog stays empty. Explicitly added custom IDs survive refresh; stale provider-supplied entries are replaced. Catalog data is not yet cached to disk across application restarts.

OpenRouter key validation uses GET /api/v1/key, because the public models endpoint cannot verify a credential. Anthropic validation now uses a free GET rather than generating a message. Built-in model-ID tests also use catalogs instead of billable inference.

## Metadata and pricing

The bundled shortlist is a dated fallback, not an exhaustive or guaranteed account-access list. Old IDs remain resolvable for historical sessions without being offered in the current shortlist.

ModelInfo distinguishes unknown pricing from confirmed zero pricing with pricingKnown. Provider prices take precedence; OpenRouter can supply reference estimates and missing context sizes. Explicit free pricing remains free during enrichment. Anthropic's native version separators are mapped to OpenRouter's IDs. Variant suffixes such as :free and :batch are never silently discarded.

Prices are base token estimates. They do not cover every cache tier, long-context tier, reasoning policy, regional price, tool charge, discount, or provider routing decision. DeepSeek's current native IDs are verified, but the bundled fallback deliberately leaves their price unknown. A direct listing or explicit override can supply metadata later.

OpenAI requests use max_completion_tokens; OpenRouter, xAI and DeepSeek retain their compatible max_tokens request field. The shared stream parser preserves usage on content events, reads trailing events without a newline, and surfaces errors embedded in an otherwise successful HTTP stream.

## Verification and limits

- The updated client successfully read the public OpenRouter catalog: 375 compatible models, 370 with known base prices, 372 with supported-parameter metadata.
- Direct-provider parsing and pagination were checked with deterministic fixtures, not authenticated production accounts.
- A headless Chromium smoke test exercised the React UI with mocked Electron APIs, fixture keys, and intercepted HTTP requests: StrictMode startup, Anthropic refresh, OpenRouter refresh, preservation of custom IDs, failed refresh, price labels, and invalid-key rejection.
- No paid model calls were made. Packaged Electron installers and OS key-storage round trips were not tested.
- OpenAI's model listing does not expose complete endpoint capabilities. The filter excludes known incompatible families; unfamiliar future names still require compatibility checks.
- Reasoning controls, Responses API migration, tool/search support, exact billing reconciliation, and durable catalog caching remain follow-up work.

## Primary references

- [OpenRouter model schema](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
- [OpenRouter public catalog](https://openrouter.ai/api/v1/models)
- [OpenRouter key validation](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-api-key)
- [Anthropic model listing](https://platform.claude.com/docs/en/api/models/list)
- [Anthropic current model IDs and prices](https://platform.claude.com/docs/en/models/overview)
- [OpenAI model listing](https://developers.openai.com/api/reference/resources/models/methods/list)
- [OpenAI completion parameters](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)
- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra)
- [Google model listing](https://ai.google.dev/api/models)
- [Google current model IDs](https://ai.google.dev/gemini-api/docs/models)
- [xAI language-model metadata and pricing units](https://docs.x.ai/developers/rest-api-reference/inference/models)
- [DeepSeek model listing](https://api-docs.deepseek.com/zh-cn/api/list-models/)
